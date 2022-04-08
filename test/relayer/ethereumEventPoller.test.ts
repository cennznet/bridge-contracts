import { expect } from 'chai';
import { TOPIC_CENNZnet_CONFIRM} from "../../scripts/subscribeEthereumDeposit";
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
    api = await Api.create({network: "local"});
    process.env.RABBIT_URL="amqp://localhost"
    process.env.MONGO_URI="mongodb://127.0.0.1:27017/bridgeDbTests"
    rabbit = await amqp.connect(process.env.RABBIT_URL);
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
    await api.disconnect();
    await mongoose.connection.close();
    await sendClaimChannel.close();
    await rabbit.close();
    provider.removeAllListeners();
  })

  describe('Deposit Poller', () => {
    it('Should publish Message into RabbitMQ when Deposit Event Missed', ( done ) => {
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
        done()
      })
      depositEventAndSubmit.then(_ => {pollDepositEvents("local", 10, erc20Peg.address, provider)})
    });
  })
})
