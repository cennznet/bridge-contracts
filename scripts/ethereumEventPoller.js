const logger = require('./logger');
const { BridgeClaim, WithdrawProof } = require('../src/mongo/models');
const ethers = require('ethers');
const pegAbi = require("../abi/ERC20Peg.json").abi;
const mongoose = require('mongoose');
const amqp = require("amqplib");
const {handleDepositEvent, TOPIC_CENNZnet_CONFIRM, wait} = require("./subscribeEthereumDeposit");
const { Api } = require('@cennznet/api');

require("dotenv").config();

async function pollDepositEvents( networkName, interval, pegContractAddress, providerOverride = false ) {
    let provider;
    let api;
    const connectionStr = process.env.MONGO_URI;
    if(mongoose.connection.readyState !== 1) await mongoose.connect(connectionStr);
    api = await Api.create({network: networkName});
    let rabbit = await amqp.connect(process.env.RABBIT_URL);
    let channel = await rabbit.createChannel();
    await channel.assertQueue(TOPIC_CENNZnet_CONFIRM);
    if (networkName === 'azalea') {
        provider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );
        api = await Api.create({network: networkName});
    }
    else if (networkName === "local"){
        api = await Api.create({network: "local"});
    }
    else {
        provider = new ethers.providers.InfuraProvider(process.env.ETH_NETWORK, process.env.INFURA_API_KEY);
        if (networkName === 'nikau') {
            api = await Api.create({provider: 'wss://nikau.centrality.me/public/ws'})
        } else {
            api = await Api.create({provider: 'wss://rata.centrality.me/public/ws'})
        }
    }
    if(providerOverride) provider = providerOverride;
    //Get all bridge claims and deposit events on
    const peg = new ethers.Contract(pegContractAddress, pegAbi, provider);
    const shouldPoll = true;
    while (shouldPoll){
        //stop poller if DB disconnects
        if(mongoose.connection.readyState === 0){
            logger.error("Mongo DB disconnected Poller stopping...");
            break;
        }
        const allEvents = await peg.queryFilter({});
        const depositEventTxHashes = allEvents.filter(event => event.event === "Deposit").map(event => event.transactionHash);
        //check if any deposit tx hashes are not in DB yet
        const allDepositClaims = await BridgeClaim.find({});
        const allDepositClaimsTxHashes = allDepositClaims.map(claim => claim.txHash);
        //get any events in db that were submitted when bridge paused
        const pausedClaims = allDepositClaims.filter(claim => claim.status === "Bridge Paused");
        const pausedClaimsTxHashes = pausedClaims.map(claim => claim.txHash);
        let missedDepositEventHashes = depositEventTxHashes.filter(txhash => !allDepositClaimsTxHashes.includes(txhash));
        missedDepositEventHashes = missedDepositEventHashes.concat(pausedClaimsTxHashes);
        logger.info("Current Missed Deposit Events Number: ", missedDepositEventHashes.length);
        //get the event for each and submit
        const eventConfirmations = (await api.query.ethBridge.eventConfirmations()).toNumber();
        const missedEventProms = missedDepositEventHashes.map(async txHash => {
            const eventInfo = allEvents.find(event => txHash === event.transactionHash);
            const cennznetAddress = eventInfo.args[3];
            const amount = eventInfo.args[2].toString();
            const tokenAddress = eventInfo.args[1];
            await handleDepositEvent(api, txHash, cennznetAddress, amount, tokenAddress, eventConfirmations, channel);
        });
        await Promise.all(missedEventProms);
        await wait(parseInt(interval));
    }
}

//TODO finish withdraw poller
async function pollWithdrawEvents( networkName, interval, pegContractAddress ) {
    let provider;
    const connectionStr = process.env.MONGO_URI;
    if(mongoose.connection.readyState !== 1) await mongoose.connect(connectionStr);
    let rabbit = await amqp.connect(process.env.RABBIT_URL);
    let channel = await rabbit.createChannel();
    await channel.assertQueue(TOPIC_CENNZnet_CONFIRM);
    const peg = new ethers.Contract(pegContractAddress, pegAbi, provider);

    // const allEvents = await peg.queryFilter({});
    // const withdrawEventTxHashes = allEvents.filter(event => event.event === "Withdraw").map(event => event.transactionHash);
    //check if any withdrawals that haven't been claimed yet
    const unClaimedWithdrawals = await WithdrawProof.find({hasClaimed:false});
    unClaimedWithdrawals.map()
}

const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
const stateIdx = process.argv.slice(2).findIndex(item => item === "--state");
const intervalIdx = process.argv.slice(2).findIndex(item => item === "--interval");
const interval = process.argv.slice(2)[intervalIdx + 1];
const state = process.argv.slice(2)[stateIdx + 1];

if(state === "deposit") pollDepositEvents(networkName, interval, pegContractAddress).catch((err) => logger.error(err));
else if(state === "withdraw") pollWithdrawEvents(networkName, interval, pegContractAddress).catch((err) => logger.error(err));

module.exports = {pollDepositEvents}