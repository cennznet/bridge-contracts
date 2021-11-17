
const { Api } = require('@cennznet/api');
require("dotenv").config();
const logger = require('./logger');
const { curly } = require("node-libcurl");
const mongoose = require('mongoose');
const { EventProcessed  } = require('../src/mongo/models');
const { ethers } = require("hardhat");
let txExecutor;
const axios = require("axios");
const timeoutMs = 20000;
const BUFFER = 1000;
// Ignore if validator public key is 0x000..
const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';

// Get the notary key from CENNZnet and convert it to public key to be used to set validator on bridge contract
async function  extractNewValidators(api, blockHash) {
    const notaryKeys = await api.query.ethBridge.nextNotaryKeys.at(blockHash);
    const newValidators = notaryKeys.map((notaryKey) => {
        if (notaryKey.toString() === IGNORE_KEY) return '0x0000000000000000000000000000000000000000';
        let decompressedPk = ethers.utils.computePublicKey(notaryKey);
        let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
        return '0x' + h.slice(26)
    });
    return newValidators;
}

async function updateLastEventProcessed(eventId, blockHash) {
    const filter = {};
    const update = { eventId, blockHash };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await EventProcessed.updateOne(filter, update, options);
}

// Submit the event proof on Ethereum Bridge contract
async function getEventPoofAndSubmit(api, eventId, bridge, txExecutor, newValidatorSetId, blockHash) {
    const eventExistsOnEth = await bridge.eventIds(eventId.toString());
    const eventProof = await withTimeout(api.derive.ethBridge.eventProof(eventId), timeoutMs);
    if (eventProof && !eventExistsOnEth) {
        const newValidators = await extractNewValidators(api, blockHash);
        logger.info(`Sending setValidators tx with the account: ${txExecutor.address}`);
        logger.info(`Parameters :::`);
        logger.info(`newValidators:${newValidators}`);
        logger.info(`newValidatorSetId: ${newValidatorSetId}`);
        logger.info(`event proof::${JSON.stringify(eventProof)}`);
        const proof = {
            eventId: eventProof.eventId,
            validatorSetId: eventProof.validatorSetId,
            r: eventProof.r,
            s: eventProof.s,
            v: eventProof.v
        };
        try {
            const gasEstimated = await bridge.estimateGas.setValidators(newValidators, newValidatorSetId, proof, {gasLimit: 500000});

            logger.info(JSON.stringify(await bridge.setValidators(newValidators, newValidatorSetId, proof, {gasLimit: gasEstimated.add(BUFFER)})));
            await updateLastEventProcessed(eventId, blockHash.toString());
            const balance = await ethers.provider.getBalance(txExecutor.address);
            logger.info(`Balance is: ${balance}`);
            const gasPrice = await ethers.provider.getGasPrice();
            logger.info(`Gas price: ${gasPrice.toString()}`);
            const gasRequired = gasEstimated.mul(gasPrice);
            logger.info(`Gas required: ${gasRequired.toString()}`);
            if (balance.lt(gasRequired.mul(2))) {
                const {statusCode, data} = await curly.post(`https://hooks.slack.com/services/${process.env.SLACK_SECRET}`, {
                    postFields: JSON.stringify({
                        "text": ` 🚨 To keep the validator relayer running, topup the eth account ${txExecutor.address} on CENNZnets ${process.env.NETWORK} chain`
                    }),
                    httpHeader: [
                        'Content-Type: application/json',
                        'Accept: application/json'
                    ],
                });
                logger.info(`Slack notification sent ${data} and status code ${statusCode}`);
            }
        } catch (e) {
            logger.warn('Something went wrong:');
            logger.error(`Error: ${e}`);
        }
    } else if (!eventProof){
        logger.info(`Could not retrieve event proof for event id ${eventId} from derived
        query api.derive.ethBridge.eventProof at ${timeoutMs} timeout`);
    }
}

async function main (networkName, bridgeContractAddress) {
    networkName = networkName || 'local';

    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);

    const api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);
    [txExecutor] = await ethers.getSigners();

    // Get the bridge instance that was deployed
    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    logger.info('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach(bridgeContractAddress);
    await bridge.deployed();
    logger.info(`CENNZnet bridge deployed to: ${bridge.address}`);
    logger.info(`Executor: ${txExecutor.address}`);


    const response = await axios.get(
        `${process.env.UNCOVER_BASEPATH}/cennznet-explorer-api/api/scan/events?moduleId=ethBridge&eventId=AuthoritySetChange&row=100&page=0`
    );
    const uncoverEventsData = response.data;
    let uncoverEvents = uncoverEventsData.data;
    console.log('data::',uncoverEvents);
    uncoverEvents.sort((a,b) => (a.block_num > b.block_num) ? 1 : ((b.block_num > a.block_num) ? -1 : 0));

  await Promise.all(
   uncoverEvents.map(async (event) => {
       const blockNumber = event.block_num;
       console.log('block number:', blockNumber);
       const jsonData = JSON.parse(event.params);
       const eventProofId = jsonData[0].value;
       const newValidatorSetId = jsonData[1].value;
       const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
       console.log('eventProofId:',eventProofId);
       await getEventPoofAndSubmit(api, eventProofId, bridge, txExecutor, newValidatorSetId.toString(), blockHash);
   }));

}

async function withTimeout(promise, timeoutMs) {
    return Promise.race ([
        promise,
        new Promise  ((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, timeoutMs);
        }),
    ]);
}

const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
main(networkName, bridgeContractAddress).catch((err) => console.log(err));
