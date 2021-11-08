
const { Api } = require('@cennznet/api');
require("dotenv").config();
const { Keyring } = require('@polkadot/keyring');
const logger = require('./logger');
const mongoose = require('mongoose');
const { BridgeClaim  } = require('../src/mongo/models');
const { ethers } = require("hardhat");
let txExecutor;

async function updateTxStatusInDB(txStatus, txHash, claimId) {
    const filter = {txHash: txHash};
    const update = { txHash: txHash, status: txStatus, claimId };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`Updated the bridge status ${txStatus} for txHash: ${txHash}`);
}

async function updateClaimSuccessfulInDB(claimId) {
    const filter = {claimId: claimId};
    const update = { status: 'Successful' };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`Updated the bridge status SUCCESSFUL for claimId: ${claimId}`);
}

async function sendClaim(claim, transactionHash, api, signer, nonce) {
    return new Promise(  (resolve, reject) => {
        console.log('Nonce is ::::', nonce);
        api.tx.erc20Peg.depositClaim(transactionHash, claim).signAndSend(signer, { nonce }, async ({status, events}) => {
            if (status.isInBlock) {
                for (const {event: {method, section, data}} of events) {
                    console.log('\t', `: ${section}.${method}`, data.toString());
                    const [, claimer] = data;
                    if (section === 'erc20Peg' && method == 'Erc20Claim' && claimer && claimer.toString() === signer.address) {
                        const eventClaimId = data[0];
                        console.log('*******************************************');
                        console.log('Deposit claim on CENNZnet side started for claim Id', eventClaimId.toString());
                        await updateTxStatusInDB( 'Submitted', transactionHash, eventClaimId);
                        resolve(eventClaimId);
                    }
                    else if (section === 'system' && method === 'ExtrinsicFailed') {
                        await updateTxStatusInDB( 'Failed', transactionHash, null);
                        reject(data.toJSON());
                    }
                }
            }
        });
    });
}

async function main (networkName, pegContractAddress) {
    networkName = networkName || 'local';

    const connectionStr = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_COLLECTION_NAME}`;
    await mongoose.connect(connectionStr);

    const api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);
    [txExecutor] = await ethers.getSigners();

    const keyring = new Keyring({type: 'sr25519'});
    const claimer = keyring.addFromUri(process.env.CENNZNET_SCERET);
    console.log('CENNZnet signer address:', claimer.address);

    // Get the bridge instance that was deployed
    const Peg = await ethers.getContractFactory('ERC20Peg');
    logger.info('Connecting to CENNZnet peg contract...');
    const peg = await Peg.attach(pegContractAddress);
    await peg.deployed();
    logger.info(`CENNZnet peg deployed to: ${peg.address}`);
    logger.info(`Executor: ${txExecutor.address}`);
    const eventConfirmation = (await api.query.ethBridge.eventConfirmations()).toNumber();
    console.log('eventConfirmation::',eventConfirmation);

    peg.on("Deposit", async (sender, tokenAddress, amount, cennznetAddress, eventInfo) => {
        let nonce = (await api.rpc.system.accountNextIndex(claimer.address)).toNumber();
        console.log('Nonce:::', nonce);
        await updateTxStatusInDB( 'waiting for block confirmations', eventInfo.transactionHash, null);
        const tx = await eventInfo.getTransaction();
        await tx.wait(eventConfirmation+1);
        const claim = {
            tokenAddress,
            amount: amount.toString(),
            beneficiary: cennznetAddress
        };
        try {
            await sendClaim(claim, eventInfo.transactionHash, api, claimer, nonce++);
        } catch (e) {
            console.log('err:',e);
        }
    });

    // Keep checking for ethbridge, verified event and updated the db (which would mean successful)
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`HEALTH CHECK => OK`);
            logger.info(`At blocknumber: ${blockNumber}`);
            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'Verified') {
                    const claimId = data[0];
                    await updateClaimSuccessfulInDB(claimId);
                }
            });
        });

}


const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
console.log('pegContractAddress::',pegContractAddress);
main(networkName, pegContractAddress).catch((err) => console.log(err));
