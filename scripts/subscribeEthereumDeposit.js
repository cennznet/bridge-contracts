
const { Api } = require('@cennznet/api');
require("dotenv").config();
const { Keyring } = require('@polkadot/keyring');
const logger = require('./logger');
const mongoose = require('mongoose');
const { BridgeClaim  } = require('../src/mongo/models');
const { ethers } = require("hardhat");
let txExecutor;
const { curly } = require("node-libcurl");
const { hexToU8a } = require("@cennznet/util");

const airDropAmount = 50000;

async function airDrop(claimId, signer, api, spendingAssetId, nonce) {
    const signerBalance = await api.query.genericAsset.freeBalance(spendingAssetId, signer.address);
    if (signerBalance.toNumber() > airDropAmount) {
        const record = await BridgeClaim.findOne({claimId});
        const cennznetAddress = record.cennznetAddress;
        const checkRecordWithAddress = await BridgeClaim.find({cennznetAddress, status: 'Successful'});
        if (checkRecordWithAddress.length === 1) {
            logger.info(`Air drop in progress for address ${cennznetAddress}`);
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
        logger.info(`Slack notification sent ${data} and status code ${statusCode}`);
    }
}

async function updateTxStatusInDB(txStatus, txHash, claimId, cennznetAddress) {
    const filter = {txHash: txHash};
    const update = { txHash: txHash, status: txStatus, claimId, cennznetAddress };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
    await BridgeClaim.updateOne(filter, update, options);
    logger.info(`Updated the bridge status ${txStatus} for txHash: ${txHash}`);
}

async function updateClaimInDB(claimId, status) {
    const filter = {claimId: claimId};
    const update = { status: status };
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
                        await updateTxStatusInDB( 'CennznetConfirming', transactionHash, eventClaimId, claim.beneficiary);
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

async function main (networkName, pegContractAddress) {
    networkName = networkName || 'local';
    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);

    const api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);
    [txExecutor] = await ethers.getSigners();

    const keyring = new Keyring({type: 'sr25519'});
    const seed = hexToU8a(process.env.CENNZNET_SECRET);
    const claimer = keyring.addFromSeed(seed);
    console.log('CENNZnet signer address:', claimer.address);

    const spendingAssetId = await api.query.genericAsset.spendingAssetId();

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
            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'Verified') {
                    let nonce = (await api.rpc.system.accountNextIndex(claimer.address)).toNumber();
                    const claimId = data[0];
                    await updateClaimInDB(claimId, 'Successful');
                    await airDrop(claimId, claimer, api, spendingAssetId, nonce++);
                }
                else if (section === 'ethBridge' && method === 'Invalid') {
                    const claimId = data[0];
                    await updateClaimInDB(claimId, 'Failed');
                }
            });
        });

}


const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
console.log('pegContractAddress::',pegContractAddress);
main(networkName, pegContractAddress).catch((err) => console.log(err));
