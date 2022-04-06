import { expect } from 'chai';
import {mainPublisher, TOPIC_VERIFY_CONFIRM, TOPIC_CENNZnet_CONFIRM, CennznetConfirmHandler} from "../../scripts/subscribeEthereumDeposit";
import {Contract} from "ethers";
import {deployContract, MockProvider} from "ethereum-waffle";
// @ts-ignore
import TestToken from "../../artifacts/contracts/TestToken.sol/TestToken.json";
// @ts-ignore
import CENNZnetBridge from "../../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json";
// @ts-ignore
import ERC20Peg from "../../artifacts/contracts/ERC20Peg.sol/ERC20Peg.json";
import {Api} from "@cennznet/api";
const Redis = require('ioredis');
const mongoose = require('mongoose');
import {BridgeClaim, ClaimEvents } from "../../src/mongo/models"
const { Rabbit, BaseQueueHandler } = require('rabbit-queue');


//TODO redo tests once rabbitMQ implemented
describe.only('subscribeEthereumDeposit', () => {
  const provider = new MockProvider();
  const [wallet] = provider.getWallets();
  let bridge: Contract;
  let erc20Peg: Contract;
  let testToken: Contract;
  let api: Api;
  let rabbit: any;
  let rabbit2: any;

  before(async () => {
    api = await Api.create({network: "local"});
    process.env.RABBIT_URL="amqp://localhost"
    process.env.MONGO_URI="mongodb://127.0.0.1:27017/bridgeDbTests"
    rabbit = new Rabbit(process.env.RABBIT_URL);
    rabbit2 = new Rabbit(process.env.RABBIT_URL);
    await mongoose.connect(process.env.MONGO_URI);


  });

  beforeEach(async () => {
    testToken = await deployContract(wallet, TestToken, [1000000], {});
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    erc20Peg = await deployContract(wallet, ERC20Peg, [bridge.address]);
    //ensure cache and db are clean
    // await rabbit.flushdb();
    await BridgeClaim.deleteMany({});
    await ClaimEvents.deleteMany({});
  });

  after(async () => {
    await api.disconnect();
    await mongoose.connection.close();
    // await rabbit.disconnect();
    // await channel.close();
    // await connection.close();

    provider.removeAllListeners();
  })

  describe('Deposit Publisher', () => {
    it('Should publish Message into Redis when Deposit occurs', (done ) => {
      //setup rabbit to listen for pubs
      class CennznetConfirmTestHandler extends BaseQueueHandler {
        constructor(queueName: any, rabbit: any, options?: {}) {
          super(queueName,rabbit, options);
        }
        handle({ msg, event }) {
          console.log('Received msg TEST: ', msg);
          console.log('Received TEST: ', event);
        }

        afterDlq({ event }) {
          console.log('added to dlq', event);
        }
      }
      new CennznetConfirmTestHandler(TOPIC_VERIFY_CONFIRM, rabbit2, {
        retries: 3,
        retryDelay: 5000,
        logEnabled: true,
        scope: 'SINGLETON',
      });

      mainPublisher("local", erc20Peg.address, provider, api, rabbit).then(async () => {
        let depositAmount = 7;
        let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
        await erc20Peg.activateDeposits();
        await testToken.approve(erc20Peg.address, depositAmount);
        await erc20Peg.deposit(testToken.address, depositAmount, cennznetAddress);
      });
    });
  })
})
