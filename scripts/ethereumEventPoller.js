const logger = require('./logger');
const { BridgeClaim, WithdrawProof } = require('../src/mongo/models');
const ethers = require('ethers');
const pegAbi = require("../abi/ERC20Peg.json").abi;
const bridgeAbi = require("../abi/CENNZnetBridge.json").abi;
const mongoose = require('mongoose');
const amqp = require("amqplib");
const {handleDepositEvent, TOPIC_CENNZnet_CONFIRM, wait} = require("./subscribeEthereumDeposit");
const {handleWithdrawEvent} = require("./subscribeWithdrawTx");
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
        let missedDepositEventHashes = depositEventTxHashes.filter(txhash => !allDepositClaimsTxHashes.includes(txhash));
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

async function pollWithdrawEvents( networkName, interval, pegContractAddress, bridgeContractAddress ) {
    let provider;
    const connectionStr = process.env.MONGO_URI;
    if(mongoose.connection.readyState !== 1) await mongoose.connect(connectionStr);
    let rabbit = await amqp.connect(process.env.RABBIT_URL);
    let channel = await rabbit.createChannel();
    await channel.assertQueue(TOPIC_CENNZnet_CONFIRM);
    if (networkName === 'azalea') {
        provider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );
    }
    else {
        provider = new ethers.providers.InfuraProvider(process.env.ETH_NETWORK, process.env.INFURA_API_KEY);
    }
    const peg = new ethers.Contract(pegContractAddress, pegAbi, provider);
    let wallet = new ethers.Wallet(process.env.ETH_ACCOUNT_KEY, provider);
    const bridge = new ethers.Contract(bridgeContractAddress, bridgeAbi, wallet);
    const shouldPoll = true;
    while (shouldPoll) {
        //stop poller if DB disconnects
        if(mongoose.connection.readyState === 0){
            logger.error("Mongo DB disconnected Poller stopping...");
            break;
        }
        const allEvents = await peg.queryFilter({});
        const allWithdrawalEvents = allEvents.filter(event => event.event === "Withdraw");
        //check if any withdrawals that haven't been claimed yet
        let unClaimedWithdrawals = await WithdrawProof.find({"withdrawals": {"$elemMatch": {"hasClaimed": false}}});
        if(unClaimedWithdrawals.length > 0){
            const unClaimedWithdrawalsProofIds = unClaimedWithdrawals.map(userWithdrawals => {
                return userWithdrawals.withdrawals.filter(tx => !tx.hasClaimed);
            }).flat().map(claim => claim.proofId);
            //get transaction input data for all events and check if matches any proof ids
            const pegInterface = new ethers.utils.Interface( pegAbi );
            const unProcessedWithdrawalProms = allWithdrawalEvents.map(async event => {
                const tx = await provider.getTransaction(event.transactionHash);
                const decodedTx = pegInterface.parseTransaction({ data: tx.data, value: tx.value});
                const eventId = decodedTx.args[3].eventId.toString();
                if(unClaimedWithdrawalsProofIds.includes(eventId)) return event;
                else return undefined;
            });
            let unProcessedWithdrawalEvents = await Promise.all(unProcessedWithdrawalProms);
            unProcessedWithdrawalEvents = unProcessedWithdrawalEvents.filter(item => item);
            const unProcessedWithdrawalHandlerProms = unProcessedWithdrawalEvents.map(async event => await handleWithdrawEvent(event, provider, pegInterface, bridge))
            await Promise.all(unProcessedWithdrawalHandlerProms);
        }
        await wait(parseInt(interval));
    }
}

const networkName = process.env.NETWORK;
const pegContractAddress = process.env.PEG_CONTRACT;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
const stateIdx = process.argv.slice(2).findIndex(item => item === "--state");
const intervalIdx = process.argv.slice(2).findIndex(item => item === "--interval");
const interval = process.argv.slice(2)[intervalIdx + 1];
const state = process.argv.slice(2)[stateIdx + 1];

if(state === "deposit") pollDepositEvents(networkName, interval, pegContractAddress).catch((err) => logger.error(err));
else if(state === "withdraw") pollWithdrawEvents(networkName, interval, pegContractAddress, bridgeContractAddress).catch((err) => logger.error(err));

module.exports = {pollDepositEvents, pollWithdrawEvents}