const { Api } = require('@cennznet/api');
const { Keyring } = require('@polkadot/keyring');
const logger = require('./logger');
const mongoose = require('mongoose');
const { BridgeClaim, ClaimEvents  } = require('../src/mongo/models');
const ethers = require('ethers');
const { curly } = require("node-libcurl");
const { hexToU8a } = require("@polkadot/util");
const pegAbi = require("../abi/ERC20Peg.json").abi;
const Redis = require('ioredis');

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

async function sendClaim(claim, transactionHash, api, nonce, redis, signer) {
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
                        const pubData = { eventClaimId, blockNumber };
                        await redis.publish(TOPIC_VERIFY_CONFIRM, JSON.stringify(pubData));
                        resolve(eventClaimId);
                    }
                    else if (section === 'system' && method === 'ExtrinsicFailed') {
                        //check if already sent claim and if so skip to claim verification step
                        const index = data.toJSON()[0].module.index;
                        const error = data.toJSON()[0].module.error;
                        //AlreadyNotarized error. findMetaError is getting out of index atm: `const errorMsg = api.registry.findMetaError({index, error});`
                        if(index === 22 && error === 6) {
                            //TODO need to find way of getting claimId from ETH tx has
                            await updateTxStatusInDB( 'AlreadyNotarized', transactionHash, null, claim.beneficiary);
                            reject(data.toJSON());
                        }
                        await updateTxStatusInDB( 'Failed', transactionHash, null, claim.beneficiary);
                        reject(data.toJSON());
                    }
                }
            }
        });
    });
}

// Wait for tx on ethereum till the confirmed blocks and then submits claim on CENNZnet,
// wait has a timeout of 10 minutes, after which it will update the status 'EthConfirmationTimeout' for a txHash
async function sendCENNZnetClaimSubscriber(data, redis, api, provider, signer) {
    const {txHash, confirms, claim} = JSON.parse(data);
    const timeout = 600000; // 10 minutes
    try {
        await provider.waitForTransaction(txHash, confirms+1, timeout); // wait for confirm blocks before sending tx on CENNZnet
        // this ensures we're not grabbing nonce in the future but can handle concurrency
        if(!firstMessage) nonce += 1;
        else firstMessage = false;
        await sendClaim(claim, txHash, api, nonce, redis, signer);
    } catch (e) {
        logger.error('Error:', e);
        if (e.message == 'timeout exceeded') {
            await updateTxStatusInDB('EthConfirmationTimeout', txHash, null, claim.beneficiary);
        }
    }
}

// This is subscribed after the claim is sent on CENNZnet, it knows the blocknumber at which claim was sent
// and it waits for 5 more finalized blocks and check if the claim was verified in these 5 blocks and updates the db
async function verifyClaimSubscriber(data, api, signer) {
    const { eventClaimId, blockNumber } = JSON.parse(data);
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
    }
}

// Fetch from db all transaction with EthereumConfirming status and add them to the queue 'TOPIC_VERIFY_CONFIRM' in case missed
async function pushEthConfirmRecords(api, provider, eventConfirmation, redis) {
    const recordWithEthConfirm = await BridgeClaim.find({status: 'EthereumConfirming'});
    await Promise.all(
        recordWithEthConfirm.map(async (bridgeClaimRecord) => {
            const eventDetails = await ClaimEvents.find({_id: bridgeClaimRecord.txHash});
            if (eventDetails.length > 0) {
                const claim = {
                    tokenAddress: eventDetails[0].tokenAddress,
                    amount: eventDetails[0].amount,
                    beneficiary: eventDetails[0].beneficiary
                };
                const data = {
                    txHash: bridgeClaimRecord.txHash,
                    claim,
                }
                logger.info(`Previous EthereumConfirming state found for TX ${bridgeClaimRecord.txHash}.`)
                await redis.publish(TOPIC_CENNZnet_CONFIRM, JSON.stringify(data));
            }
        })
    );
}

// Fetch from db all transaction with CENNZnetConfirming status and add them to the queue 'TOPIC_VERIFY_CONFIRM'
async function pushCennznetConfirmRecords(api, provider, redis) {
    const recordWithEthConfirm = await BridgeClaim.find({status: 'CENNZnetConfirming'});
    await Promise.all(
        recordWithEthConfirm.map(async (bridgeClaimRecord) => {
            const eventDetails = await ClaimEvents.find({_id: bridgeClaimRecord.txHash});
            if (eventDetails.length > 0) {
                const pubData = { eventClaimId: bridgeClaimRecord.claimId, blockNumber: eventDetails[0].blockNumber };
                await redis.publish(TOPIC_VERIFY_CONFIRM, JSON.stringify(pubData));
            }
        })
    );
}

async function mainPublisher(networkName, pegContractAddress) {
    networkName = networkName || 'local';
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);

    const redis = new Redis();

    let api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);

    let provider;
    if (networkName === 'azalea') {
        provider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );
        api = await Api.create({network: networkName});
    } else {
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
    const eventConfirmation = (await api.query.ethBridge.eventConfirmations()).toNumber();
    await pushEthConfirmRecords(api, provider, eventConfirmation, redis);
    await pushCennznetConfirmRecords(api, provider, redis);

    // On eth side deposit push pub sub queue with the data, if bridge is paused, update tx status as bridge paused
    peg.on("Deposit", async (sender, tokenAddress, amount, cennznetAddress, eventInfo) => {
        logger.info(`Got the event...${JSON.stringify(eventInfo)}`);
        logger.info('*****************************************************');
        const checkIfBridgePause = await api.query.ethBridge.bridgePaused();
        if (!checkIfBridgePause.toHuman()) {
            await updateTxStatusInDB('EthereumConfirming', eventInfo.transactionHash, null, cennznetAddress);
            const claim = {
                tokenAddress,
                amount: amount.toString(),
                beneficiary: cennznetAddress
            };
            await updateClaimEventsInDB({txHash: eventInfo.transactionHash, tokenAddress, amount, beneficiary: cennznetAddress});
            const data = { txHash: eventInfo.transactionHash, claim, confirms: eventConfirmation, blockNumber:latestFinalizedBlockNumber }
            await redis.publish(TOPIC_CENNZnet_CONFIRM, JSON.stringify(data));
        } else {
            await updateTxStatusInDB('Bridge Paused', eventInfo.transactionHash, null, cennznetAddress);
        }
    });
}

async function mainSubscriber(networkName) {
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);
    const redis = new Redis();
    const redisPub = new Redis();
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
    // Two pub-sub queues -- one for when deposit from ethereum side happens, other when deposit on cennznet happens
    // subscribe ETH confirm event and send claim on CENNZnet
    redis.subscribe(TOPIC_VERIFY_CONFIRM, TOPIC_CENNZnet_CONFIRM, (err, count) => {
        if (err) {
            // Just like other commands, subscribe() can fail for some reasons, ex network issues.
            logger.error("Failed to subscribe: %s", err.message);
        } else {
            // `count` represents the number of channels this client are currently subscribed to.
            logger.info(
                `Subscribed successfully! This client is currently subscribed to ${count} channels.`
            );
        }
    });

    // Keep track of latest finalized block
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);
            latestFinalizedBlockNumber = blockNumber;
        });
    // listen for messages from publisher
    redis.on("message", (channel, message) => {
        try {
            if (channel === TOPIC_CENNZnet_CONFIRM){
                logger.info(`Received message from ${channel}`);
                sendCENNZnetClaimSubscriber(message, redisPub, api, provider, signer);
            }
            else if(channel === TOPIC_VERIFY_CONFIRM){
                logger.info(`Received message from ${channel}`);
                verifyClaimSubscriber(message, api, signer)
            }
        }
        catch (e) {
            logger.error('Error:', e);
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

const queueNetwork = process.env.MSG_QUEUE_NETWORK;
const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
const stateIdx = process.argv.slice(2).findIndex(item => item === "--state");
const state = process.argv.slice(2)[stateIdx + 1]
const airDropAmount = 50000;
const TOPIC_CENNZnet_CONFIRM = `STATE_CENNZ_CONFIRM_${queueNetwork}`;
const TOPIC_VERIFY_CONFIRM = `STATE_VERIFY_CONFIRM_${queueNetwork}`;
let nonce;
let firstMessage = true;
let latestFinalizedBlockNumber;

if(state === "publisher") mainPublisher(networkName, pegContractAddress).catch((err) => logger.error(err));
else if (state === "subscriber") mainSubscriber(networkName).catch((err) => logger.error(err));
