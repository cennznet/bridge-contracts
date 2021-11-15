
const { Api } = require('@cennznet/api');
require("dotenv").config();
const logger = require('./logger');
const { curly } = require("node-libcurl");
const mongoose = require('mongoose');
const { EventProcessed  } = require('../src/mongo/models');
const { ethers } = require("hardhat");
let txExecutor;

const BUFFER = 10000000;
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
    const eventProof = await withTimeout(api.derive.ethBridge.eventProof(eventId), 20000);
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

            logger.info(JSON.stringify(await bridge.setValidators(newValidators, newValidatorSetId, proof, {gasLimit: gasEstimated.addn(BUFFER)})));
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

    // For any kind of restart, we check if the last event proof generated on CENNZnet side, has been update on Eth side
    logger.info('Check the last event proof generated on CENNZnet side, has been update on Eth side');
    const lastEventProofIdFromCennznet = await api.query.ethBridge.notarySetProofId();
    logger.info(`lastEventProofIdFromCennznet: ${lastEventProofIdFromCennznet.toString()}`);
    const eventExistsOnEth = await bridge.eventIds(lastEventProofIdFromCennznet.toString());
    logger.info(`eventExists on Ethereum: ${eventExistsOnEth}`);
    try {
        // check if event proof exist on Eth for last event proof id of CENNZnet
        if (!eventExistsOnEth) {
            const lastEventProcessed = await EventProcessed.findOne();
            let scanFromEvent = parseInt(lastEventProofIdFromCennznet);
            if (lastEventProcessed) {
                scanFromEvent = parseInt(lastEventProcessed.eventId) + 1;
            }
            console.log(`Iterating through all unprocessed event ids from ${scanFromEvent} to ${lastEventProofIdFromCennznet}`);
            for (let i = scanFromEvent; i <=  parseInt(lastEventProofIdFromCennznet);i++ ) {
                console.log('At Event id:',i);
                const eventProof = await withTimeout(api.derive.ethBridge.eventProof(i), 10000);
                if (eventProof && eventProof.tag === 'sys:authority-change') {
                    const checkEventExistsOnEth = await bridge.eventIds(i.toString());
                    if (!checkEventExistsOnEth) {
                        const newValidatorSetId = parseInt(eventProof.validatorSetId) + 1;
                        await getEventPoofAndSubmit(api, eventProof.eventId, bridge, txExecutor, newValidatorSetId.toString(), eventProof.blockHash);
                    }
                }
            }
        }
    } catch (e) {
        logger.warn('Something went wrong while setting last event proof generated on CENNZnet side:');
        logger.error(`Error: ${e}`);
    }

    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);

            const blockHash = head.hash.toString();
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'AuthoritySetChange') {
                    const dataFetched = data.toHuman();
                    const eventIdFound = dataFetched[0];
                    const newValidatorSetId = parseInt(dataFetched[1]);
                    await getEventPoofAndSubmit(api, eventIdFound, bridge, txExecutor, newValidatorSetId.toString(), blockHash);
                }
            })
        });
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
