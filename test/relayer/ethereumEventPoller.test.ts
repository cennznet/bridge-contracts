import { expect } from 'chai';
import { TOPIC_CENNZnet_CONFIRM, wait} from "../../scripts/subscribeEthereumDeposit";
import {Contract} from "ethers";
import {deployContract, MockProvider} from "ethereum-waffle";
// @ts-ignore
import TestToken from "../../artifacts/contracts/TestToken.sol/TestToken.json";
// @ts-ignore
import CENNZnetBridge from "../../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json";
// @ts-ignore
import ERC20Peg from "../../artifacts/contracts/ERC20Peg.sol/ERC20Peg.json";
import {Api} from "@cennznet/api";
const mongoose = require('mongoose');
import {BridgeClaim } from "../../src/mongo/models"
const amqp = require("amqplib");


import {pollDepositEvents} from "../../scripts/ethereumEventPoller";

describe('ethereumEventPoller', () => {
  const provider = new MockProvider();
  const [wallet] = provider.getWallets();
  let bridge: Contract;
  let erc20Peg: Contract;
  let testToken: Contract;
  let api: Api;
  let rabbit: any;
  let sendClaimChannel: any;

  before(async () => {
    //always ensure we're testing on localhost
    if(process.env.CI === "true") process.env.RABBIT_URL="amqp://guest:guest@127.0.0.1/vhost_name";
    else process.env.RABBIT_URL="amqp://localhost";
    process.env.MONGO_URI="mongodb://127.0.0.1:27017/bridgeDbTests"
    api = await Api.create({network: "local"});
    rabbit = await amqp.connect(process.env.RABBIT_URL);
    await mongoose.connect(process.env.MONGO_URI);
    //ensure cache and db are clean
    await BridgeClaim.deleteMany({});
  });

  beforeEach(async () => {
    testToken = await deployContract(wallet, TestToken, [1000000], {});
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    erc20Peg = await deployContract(wallet, ERC20Peg, [bridge.address]);
    //ensure cache and db are clean
    await BridgeClaim.deleteMany({});
    sendClaimChannel = await rabbit.createChannel();
    sendClaimChannel.deleteQueue(TOPIC_CENNZnet_CONFIRM);
    await sendClaimChannel.assertQueue(TOPIC_CENNZnet_CONFIRM);
  });

  after(async () => {
    await BridgeClaim.deleteMany({});
    await api.disconnect();
    await mongoose.connection.close();
    await sendClaimChannel.close();
    await rabbit.close();
    provider.removeAllListeners();
    //wait short time for poller to disconnect
    await wait(2);
  })

  describe('Deposit Poller', () => {
    it('Should publish Message into RabbitMQ and DB when Deposit Event Missed', ( done ) => {
      //trigger deposit and ensure event get published
      let depositAmount = 7;
      let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
      const depositEventAndSubmit = new Promise( async (resolve, reject) => {
          try {
            await erc20Peg.activateDeposits();
            await testToken.approve(erc20Peg.address, depositAmount);
            await erc20Peg.deposit(testToken.address, depositAmount, cennznetAddress);
            resolve(true);
          }
          catch (e) {
            reject(new Error(e.message));
          }
      });
      //setup rabbit to listen for pubs
      sendClaimChannel.consume(TOPIC_CENNZnet_CONFIRM, async (message)=> {
        const data = JSON.parse(message.content.toString());
        expect(parseInt(data.claim.amount)).equal(depositAmount);
        expect(data.claim.beneficiary).equal(cennznetAddress);
        //check if published to DB
        const foundClaim = await BridgeClaim.find({txHash:data.txHash});
        expect(!!foundClaim).equal(true);
        done()
      });
      //emit deposit event then ensure it is recorded
      depositEventAndSubmit.then(_ => {pollDepositEvents("local", 10, erc20Peg.address, provider)});
    });
  })
})
