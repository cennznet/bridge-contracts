const { Api } = require('@cennznet/api');
const { Keyring } = require('@polkadot/keyring');
const logger = require('./logger');
const mongoose = require('mongoose');
const { BridgeClaim, ClaimEvents  } = require('../src/mongo/models');
const ethers = require('ethers');
const { curly } = require("node-libcurl");
const { hexToU8a } = require("@polkadot/util");
const pegAbi = require("../abi/ERC20Peg.json").abi;
const BigNumber =  require("bignumber.js");
const amqp = require("amqplib");

require("dotenv").config();

async function airDrop(claimId, signer, api, spendingAssetId) {
    const signerBalance = await api.query.genericAsset.freeBalance(spendingAssetId, signer.address);
    if (signerBalance.toNumber() > airDropAmount) {
        const record = await BridgeClaim.findOne({claimId});
        const cennznetAddress = record.cennznetAddress;
        const checkRecordWithAddress = await BridgeClaim.find({cennznetAddress, status: 'Successful'});
        if (checkRecordWithAddress.length === 1) {
            logger.info(`CLAIM Air drop in progress for address ${cennznetAddress}`);
            nonce +=1;
            await api.tx.genericAsset.transfer(spendingAssetId, cennznetAddress, airDropAmount).signAndSend(signer, { nonce }, async ({status, events}) => {
                if (status.isInBlock) {
                    for (const {event: {method, section}} of events) {
                        if (section === 'system' && method == 'ExtrinsicSuccess') {
                            logger.info(`Successfully Air dropped First Time reward for address ${cennznetAddress}`);
                        }
                    }
                }
            });
        }
    } else {
        const { statusCode, data } = await curly.post(`https://hooks.slack.com/services/${process.env.SLACK_SECRET}`, {
            postFields: JSON.stringify({
                "text": ` 🚨 To keep the claim relayer airdrop cpay, topup the cennznet account ${signer.address} on CENNZnets ${process.env.NETWORK} chain`
            }),
            httpHeader: [
                'Content-Type: application/json',
                'Accept: application/json'
            ],
        });
        logger.info(`CLAIM Slack notification sent ${data} and status code ${statusCode}`);
    }
}

async function updateTxStatusInDB(txStatus, txHash, claimId, cennznetAddress) {
    const filter = {txHash: txHash};
    const update = { txHash: txHash, status: txStatus, claimId, cennznetAddress };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`CLAIM: Updated the bridge status ${txStatus} for txHash: ${txHash}`);
}

async function updateClaimEventsInDB({txHash, tokenAddress, amount, beneficiary}) {
    const filter = {_id: txHash};
    const update = { tokenAddress, amount, beneficiary  };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await ClaimEvents.updateOne(filter, update, options);
    logger.info(`CLAIM Updated the claim events data ${tokenAddress}, ${amount}, ${beneficiary} for txHash: ${txHash}`);
}

async function updateClaimEventsBlock({txHash, claimId, blockNumber}) {
    const filter = {_id: txHash};
    const update = { claimId, blockNumber  };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await ClaimEvents.updateOne(filter, update, options);
    logger.info(`CLAIM Updated the claim events - claim id ${claimId} and ${blockNumber} for txHash: ${txHash}`);
}

async function updateClaimInDB(claimId, status) {
    const filter = {claimId: claimId};
    const update = { status: status };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`CLAIM Updated the bridge status ${status} for claimId: ${claimId}`);
}

async function sendClaim(claim, transactionHash, api, nonce, signer) {
    return new Promise(  (resolve, reject) => {
        api.tx.erc20Peg.depositClaim(transactionHash, claim).signAndSend(signer, { nonce }, async ({status, events}) => {
            if (status.isInBlock) {
                const blockHash = status.asInBlock;
                const block = await api.rpc.chain.getBlock(blockHash);
                const blockNumber =  block.block.header.number.toNumber();
                for (const {event: {method, section, data}} of events) {
                    const [, claimer] = data;
                    if (section === 'erc20Peg' && method == 'Erc20Claim' && claimer && claimer.toString() === signer.address) {
                        const eventClaimId = data[0].toString();
                        logger.info('CLAIM: *******************************************');
                        logger.info('CLAIM: at block number: ',blockNumber);
                        logger.info('CLAIM: Deposit claim on CENNZnet side started for claim Id: ', eventClaimId);
                        await updateTxStatusInDB( 'CENNZnetConfirming', transactionHash, eventClaimId, claim.beneficiary);
                        await updateClaimEventsBlock({txHash: transactionHash, claimId: eventClaimId, blockNumber});
                        const verifyClaimData = { eventClaimId, blockNumber };
                        resolve(verifyClaimData);
                    }
                    else if (section === 'system' && method === 'ExtrinsicFailed') {
                        //check if already sent claim and if so skip to claim verification step
                        const index =  new BigNumber(data.toJSON()[0].module.index);
                        const error = new BigNumber(data.toJSON()[0].module.error);
                        //AlreadyNotarized error. findMetaError is getting out of index atm: `const errorMsg = api.registry.findMetaError({index, error});`
                        // const errorMsg = api.registry.findMetaError({index, error});
                        if(index === 22 && error === 6) {
                            //TODO need to find way of getting claimId from ETH tx hash to find if already verified
                            await updateTxStatusInDB( 'AlreadyNotarized', transactionHash, null, claim.beneficiary);
                            reject('AlreadyNotarized');
                            reject(new Error("AlreadyNotarized"));
                        }
                        await updateTxStatusInDB( 'Failed', transactionHash, null, claim.beneficiary);
                        reject(new Error("ExtrinsicFailed"));
                    }
                }
            }
        });
    });
}

// Wait for tx on ethereum till the confirmed blocks and then submits claim on CENNZnet,
// wait has a timeout of 10 minutes, after which it will update the status 'EthConfirmationTimeout' for a txHash
async function sendCENNZnetClaimSubscriber(data, api, provider, signer) {
    const {txHash, confirms, claim} = data;
    const timeout = 600000; // 10 minutes
    try {
        await provider.waitForTransaction(txHash, confirms+1, timeout); // wait for confirm blocks before sending tx on CENNZnet
        // this ensures we're not grabbing nonce in the future but can handle concurrency
        if(!firstMessage) nonce += 1;
        else firstMessage = false;
        return await sendClaim(claim, txHash, api, nonce, signer);
    } catch (e) {
        logger.error('Error:', e);
        if (e.message == 'timeout exceeded') {
            await updateTxStatusInDB('EthConfirmationTimeout', txHash, null, claim.beneficiary);
        }
        throw new Error(e.message);
    }
}

// This is subscribed after the claim is sent on CENNZnet, it knows the blocknumber at which claim was sent
// and it waits for 5 more finalized blocks and check if the claim was verified in these 5 blocks and updates the db
async function verifyClaimSubscriber(data, api, signer) {
    const { eventClaimId, blockNumber } = data;
    const blockIntervalSecond = 5;
    const blockNumWait = 5;
    const spendingAssetId = await api.query.genericAsset.spendingAssetId();
    await wait(blockNumWait * blockIntervalSecond);
    try {
        //loop through next 5 blocks to see if the claim is verified
        for (let i = blockNumber; i < blockNumber+blockNumWait; i++) {
            const blockHash = await api.rpc.chain.getBlockHash(i);
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'Verified') {
                    const claimId = data[0];
                    if (eventClaimId.toString() === claimId.toString()) {
                        logger.info(`CLAIM: ${claimId} verified successfully`);
                        await updateClaimInDB(claimId, 'Successful');
                        await airDrop(claimId, signer, api, spendingAssetId);
                    }
                } else if (section === 'ethBridge' && method === 'Invalid') {
                    const claimId = data[0];
                    if (eventClaimId.toString() === claimId.toString()) {
                        logger.info(`CLAIM: ${claimId} verification failed`);
                        await updateClaimInDB(claimId, 'Failed');
                    }
                }
            });
        }
    } catch (e) {
        logger.error(`Error: ${e}`);
        throw new Error(e.message);
    }
}

async function mainPublisher(networkName, pegContractAddress, providerOverride= false, apiOverride = false, rabbitOverride = false, channelOverride = false ) {
    networkName = networkName || 'local';
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);
    let api;
    let provider;
    let rabbit;
    if(rabbit) rabbit = rabbitOverride;
    else rabbit = await amqp.connect(process.env.RABBIT_URL);
    if(apiOverride) api = apiOverride;
    else api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);

    if (networkName === 'azalea') {
        provider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );
        api = await Api.create({network: networkName});
    }
    else if (networkName === "local"){
        provider = providerOverride; //for testing
    }
    else {
        provider = new ethers.providers.InfuraProvider(process.env.ETH_NETWORK, process.env.INFURA_API_KEY);
        if (networkName === 'nikau') {
            api = await Api.create({provider: 'wss://nikau.centrality.me/public/ws'})
        } else {
            api = await Api.create({provider: 'wss://rata.centrality.me/public/ws'})
        }
    }

    // Keep track of latest finalized block
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);
            latestFinalizedBlockNumber = blockNumber;
        });

    const peg = new ethers.Contract(pegContractAddress, pegAbi, provider);
    logger.info(`Connecting to CENNZnet peg contract ${pegContractAddress}...`);
    const eventConfirmations = (await api.query.ethBridge.eventConfirmations()).toNumber();
    let channel;
    if (channelOverride) channel = channelOverride;
    else channel = await rabbit.createChannel();
    await channel.assertQueue(TOPIC_CENNZnet_CONFIRM);
    // On eth side deposit push pub sub queue with the data, if bridge is paused, update tx status as bridge paused
    peg.on("Deposit", async (sender, tokenAddress, amount, cennznetAddress, eventInfo) => {
        logger.info(`Got the event...${JSON.stringify(eventInfo)}`);
        logger.info('*****************************************************');
        await handleDepositEvent(api, eventInfo.transactionHash, cennznetAddress, amount, tokenAddress, eventConfirmations, channel );
    });
}

async function handleDepositEvent(api, transactionHash, cennznetAddress, amount, tokenAddress, eventConfirmations, channel ) {
    const checkIfBridgePause = await api.query.ethBridge.bridgePaused();
    if (!checkIfBridgePause.toHuman()) {
        await updateTxStatusInDB('EthereumConfirming', transactionHash, null, cennznetAddress);
        const claim = {
            tokenAddress,
            amount: amount.toString(),
            beneficiary: cennznetAddress
        };
        await updateClaimEventsInDB({txHash: transactionHash, tokenAddress, amount, beneficiary: cennznetAddress});
        const data = { txHash: transactionHash, claim, confirms: eventConfirmations, blockNumber:latestFinalizedBlockNumber }
        await channel.sendToQueue(TOPIC_CENNZnet_CONFIRM, Buffer.from(JSON.stringify(data)));
    logger.info(`Deposit Event handled for TxHash...${transactionHash}`);
    } else {
        await updateTxStatusInDB('Bridge Paused', transactionHash, null, cennznetAddress);
    }
}

async function mainSubscriber(networkName) {
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);
    const rabbit = await amqp.connect(process.env.RABBIT_URL);

    const api = await Api.create({network: networkName});
    logger.info(`Connected to cennznet network ${networkName}`);
    const keyring = new Keyring({type: 'sr25519'});
    const seed = hexToU8a(process.env.CENNZNET_SECRET);
    const signer = keyring.addFromSeed(seed);
    nonce = (await api.rpc.system.accountNextIndex(signer.address)).toNumber();
    let provider;
    if (networkName === 'azalea') {
        provider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );
    } else {
        provider = new ethers.providers.InfuraProvider(process.env.ETH_NETWORK, process.env.INFURA_API_KEY);
    }
    // Keep track of latest finalized block
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);
            latestFinalizedBlockNumber = blockNumber;
        });
    //Setup rabbitMQ
    const sendClaimChannel = await rabbit.createChannel();
    await sendClaimChannel.assertQueue(TOPIC_CENNZnet_CONFIRM);
    const verifyClaimChannel = await rabbit.createChannel();
    await verifyClaimChannel.assertQueue(TOPIC_VERIFY_CONFIRM);
    const initialDelay = 5000;
    const maxRetries = 3;
    sendClaimChannel.consume(TOPIC_CENNZnet_CONFIRM, async (message)=> {
        try{
            logger.info(`Received Message TOPIC_CENNZnet_CONFIRM: ${message.content.toString()}`);
            const data = JSON.parse(message.content.toString());
            const verifyClaimData = await sendCENNZnetClaimSubscriber(data, api, provider, signer);
            sendClaimChannel.ack(message);
            await verifyClaimChannel.sendToQueue(TOPIC_VERIFY_CONFIRM, Buffer.from(JSON.stringify(verifyClaimData)));
        }
        catch (e) {
            //if already sent claim dont try to resend
            if(e.message === "AlreadyNotarized") return;
            //TODO Alert slack if all retries fail
            const failedCB = () => { console.info("failed all TOPIC_VERIFY_CONFIRM retries")}
            await retryMessage(sendClaimChannel, message, initialDelay, maxRetries, failedCB)
        }
    });
    verifyClaimChannel.consume(TOPIC_VERIFY_CONFIRM, async (message)=> {
        try{
            logger.info(`Received Message TOPIC_VERIFY_CONFIRM: ${message.content.toString()}`);
            const data = JSON.parse(message.content.toString());
            await verifyClaimSubscriber(data, api, signer);
            verifyClaimChannel.ack(message);
        }
        catch (e) {
            //TODO Alert slack if all retries fail
            const failedCB = () => {console.info("failed all TOPIC_VERIFY_CONFIRM retries")}
            await retryMessage(verifyClaimChannel, message, initialDelay, maxRetries, failedCB)
        }
    });
}

async function wait(seconds) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, seconds * 1000);
    });
}

async function retryMessage( channel, message, initialDelay, maxRetries, failedCallback ) {
    try {
        const headers = message.properties.headers || {};
        const retryCount = ( headers[ "x-retries" ] || 0 ) + 1;
        const delayAmountSeconds = (Math.pow( 2, retryCount - 1 ) * initialDelay) / 1000;
        if ( retryCount > maxRetries ) {
            // We're past our retry max count.  Dead-letter it.
            channel.reject( message, false );
            failedCallback()
        }
        else {
            headers[ "x-retries" ] = retryCount;
            message.properties.headers = headers;
            await wait(delayAmountSeconds);
            await channel.sendToQueue(TOPIC_CENNZnet_CONFIRM, message.content, message.properties);
            channel.ack( message );
        }
    }
    catch(e){
        // if error thrown during retry
        channel.nack( message );
        throw new Error(e.message);
    }
}

const queueNetwork = process.env.MSG_QUEUE_NETWORK;
const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
const stateIdx = process.argv.slice(2).findIndex(item => item === "--state");
const state = process.argv.slice(2)[stateIdx + 1];
const airDropAmount = 50000;
const TOPIC_CENNZnet_CONFIRM = `STATE_CENNZ_CONFIRM_${queueNetwork}`;
const TOPIC_VERIFY_CONFIRM = `STATE_VERIFY_CONFIRM_${queueNetwork}`;
let nonce;
let firstMessage = true;
let latestFinalizedBlockNumber;

if(state === "publisher") mainPublisher(networkName, pegContractAddress).catch((err) => logger.error(err));
else if (state === "subscriber") mainSubscriber(networkName).catch((err) => logger.error(err));

module.exports = {wait, handleDepositEvent, mainPublisher, mainSubscriber, TOPIC_VERIFY_CONFIRM, TOPIC_CENNZnet_CONFIRM}