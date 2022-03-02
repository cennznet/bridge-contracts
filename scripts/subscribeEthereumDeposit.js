
const { Api } = require('@cennznet/api');
require("dotenv").config();
const { Keyring } = require('@polkadot/keyring');
const logger = require('./logger');
const mongoose = require('mongoose');
const { BridgeClaim  } = require('../src/mongo/models');
const ethers = require('ethers');
const { curly } = require("node-libcurl");
const { hexToU8a } = require("@polkadot/util");
const pegAbi = require("../abi/ERC20Peg.json").abi;
const PubSub = require('pubsub-js');
const airDropAmount = 50000;

async function airDrop(claimId, signer, api, spendingAssetId, nonce) {
    const signerBalance = await api.query.genericAsset.freeBalance(spendingAssetId, signer.address);
    if (signerBalance.toNumber() > airDropAmount) {
        const record = await BridgeClaim.findOne({claimId});
        const cennznetAddress = record.cennznetAddress;
        const checkRecordWithAddress = await BridgeClaim.find({cennznetAddress, status: 'Successful'});
        if (checkRecordWithAddress.length === 1) {
            logger.info(`CLAIM Air drop in progress for address ${cennznetAddress}`);
            await api.tx.genericAsset.transfer(spendingAssetId, cennznetAddress, airDropAmount).signAndSend(signer, { nonce });
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

async function updateClaimInDB(claimId, status) {
    const filter = {claimId: claimId};
    const update = { status: status };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`CLAIM Updated the bridge status ${status} for claimId: ${claimId}`);
}

async function sendClaim(claim, transactionHash, api, signer, nonce) {
    return new Promise(  (resolve, reject) => {
        console.log('CLAIM: Nonce is ::::', nonce);
        api.tx.erc20Peg.depositClaim(transactionHash, claim).signAndSend(signer, { nonce }, async ({status, events}) => {
            if (status.isInBlock) {
                const blockHash = status.asInBlock;
                const block = await api.rpc.chain.getBlock(blockHash);
                const blockNumber =  block.block.header.number.toNumber();
                for (const {event: {method, section, data}} of events) {
                    console.log('\t', `: ${section}.${method}`, data.toString());
                    const [, claimer] = data;
                    if (section === 'erc20Peg' && method == 'Erc20Claim' && claimer && claimer.toString() === signer.address) {
                        const eventClaimId = data[0];
                        console.log('CLAIM: *******************************************');
                        console.log('CLAIM: at block number',blockNumber);
                        console.log('CLAIM: Deposit claim on CENNZnet side started for claim Id', eventClaimId.toString());
                        await updateTxStatusInDB( 'CennznetConfirming', transactionHash, eventClaimId, claim.beneficiary);
                        const pubData = { eventClaimId, api, blockNumber, claimer: signer }
                        PubSub.publish(TOPIC_CENNZnet_CONFIRM, pubData);
                        resolve(eventClaimId);
                    }
                    else if (section === 'system' && method === 'ExtrinsicFailed') {
                        await updateTxStatusInDB( 'Failed', transactionHash, null, claim.beneficiary);
                        reject(data.toJSON());
                    }
                }
            }
        });
    });
}

// Two pub-sub queues -- one for when deposit from ethereum side happens, other when deposit on cennznet happens
const TOPIC_ETH_CONFIRM = 'STATE_ETH_CONFIRM';
const TOPIC_CENNZnet_CONFIRM = 'STATE_CENNZ_CONFIRM';

// subscribe ETH confirm event and send claim on CENNZnet
PubSub.subscribe(TOPIC_ETH_CONFIRM, sendCENNZnetClaimSubscriber);
// subscribe CENNZnet confirm event and send claim on CENNZnet
PubSub.subscribe(TOPIC_CENNZnet_CONFIRM, verifyClaimSubscriber);

async function sendCENNZnetClaimSubscriber(msg, data) {
    const {txHash, provider, confirms, claim,  claimer, api} = data;
    const timeout = 600000; // 10 minutes
    try {
        await provider.waitForTransaction(txHash, confirms+1, timeout); // wait for confirm blocks before sending tx on CENNZnet
        let nonce = (await api.rpc.system.accountNextIndex(claimer.address)).toNumber();
        console.log('CLAIM Nonce:::', nonce);
        await sendClaim(claim, txHash, api, claimer, nonce++);
    } catch (e) {
        console.log('err:', e);
        if (e.message == 'timeout exceeded') {
            await updateTxStatusInDB('EthConfirmationTimeout', txHash, null, claim.beneficiary);
        }
    }
}

async function verifyClaimSubscriber(msg, data) {
    const { eventClaimId, claimer, api } = data;
    const intervalSecond = 5;
    let { blockNumber } = data;
    const spendingAssetId = await api.query.genericAsset.spendingAssetId();
    const blockDiff = 4 - (latestFinalizedBlockNumber - blockNumber);
    await wait(blockDiff * intervalSecond); // wait for 4*5 = 20 seconds
    console.log('Inside verify claim subscriber');
    console.log('block number::', blockNumber);
    console.log('latestFinalizedBlockNumber::',latestFinalizedBlockNumber);
    try {
        //loop through next 5 blocks to see if the claim is verified
        for (let i = blockNumber; i < blockNumber+5; i++) {
            console.log('Current block:',i);
            console.log('finalized at:',latestFinalizedBlockNumber);
            const blockHash = await api.rpc.chain.getBlockHash(i);
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'Verified') {
                    let nonce = (await api.rpc.system.accountNextIndex(claimer.address)).toNumber();
                    const claimId = data[0];
                    console.log('ClaimId::::', claimId.toString());
                    console.log('event claimId::', eventClaimId.toString());
                    if (eventClaimId.toString() === claimId.toString()) {
                        logger.info(`CLAIM: ${claimId} verified successfully`);
                        await updateClaimInDB(claimId, 'Successful');
                        await airDrop(claimId, claimer, api, spendingAssetId, nonce++);
                    }
                } else if (section === 'ethBridge' && method === 'Invalid') {
                    const claimId = data[0];
                    console.log('ClaimId::::', claimId.toString());
                    console.log('event claimId::', eventClaimId.toString());
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

async function wait(seconds) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, seconds * 1000);
    });
}

let latestFinalizedBlockNumber;

async function main (networkName, pegContractAddress) {
    networkName = networkName || 'local';
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);

    let api;
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

    const keyring = new Keyring({type: 'sr25519'});
    const seed = hexToU8a(process.env.CENNZNET_SECRET);
    const claimer = keyring.addFromSeed(seed);
    console.log('CENNZnet signer address:', claimer.address);


    const peg = new ethers.Contract(pegContractAddress, pegAbi, provider);
    logger.info('Connecting to CENNZnet peg contract...');
    logger.info(`CENNZnet peg deployed to: ${peg.address}`);
    const eventConfirmation = (await api.query.ethBridge.eventConfirmations()).toNumber();
    logger.info(`eventConfirmation::${eventConfirmation}`);

    peg.on("Deposit", async (sender, tokenAddress, amount, cennznetAddress, eventInfo) => {
        logger.info(`Got the event...${JSON.stringify(eventInfo)}`);
        logger.info('*****************************************************');
        const checkIfBridgePause = await api.query.ethBridge.bridgePaused();
        if (!checkIfBridgePause.toHuman()) {
            await updateTxStatusInDB('EthereumConfirming', eventInfo.transactionHash, null, cennznetAddress);
            const tx = await eventInfo.getTransaction();
            await tx.wait(eventConfirmation + 1);
            const claim = {
                tokenAddress,
                amount: amount.toString(),
                beneficiary: cennznetAddress
            };
            try {
                let nonce = (await api.rpc.system.accountNextIndex(claimer.address)).toNumber();
                console.log('Nonce:::', nonce);
                await sendClaim(claim, eventInfo.transactionHash, api, claimer, nonce++);
            } catch (e) {
                console.log('err:', e);
            }
        }
    });

    // Keep checking for ethbridge, verified event and updated the db (which would mean successful)
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);
            latestFinalizedBlockNumber = blockNumber;
        });

}


const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
console.log('pegContractAddress::',pegContractAddress);
main(networkName, pegContractAddress).catch((err) => console.log(err));
