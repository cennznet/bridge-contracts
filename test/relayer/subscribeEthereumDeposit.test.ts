import { expect } from 'chai';
import {mainPublisher, TOPIC_VERIFY_CONFIRM, TOPIC_CENNZnet_CONFIRM} from "../../scripts/subscribeEthereumDeposit";
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

//TODO redo tests once rabbitMQ implemented
describe.skip('subscribeEthereumDeposit', () => {
  const provider = new MockProvider();
  const [wallet] = provider.getWallets();
  let bridge: Contract;
  let erc20Peg: Contract;
  let testToken: Contract;
  let api: Api;
  let redisPub: any;
  let redisSub: any;

  before(async () => {
    api = await Api.create({network: "local"});
    process.env.REDIS_URL="redis://localhost:6379"
    process.env.MONGO_URI="mongodb://127.0.0.1:27017/bridgeDbNikau"
    redisPub = new Redis(process.env.REDIS_URL);
    redisSub = new Redis(process.env.REDIS_URL);
    await mongoose.connect(process.env.MONGO_URI);
  });

  beforeEach(async () => {
    testToken = await deployContract(wallet, TestToken, [1000000], {});
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    erc20Peg = await deployContract(wallet, ERC20Peg, [bridge.address]);
    //ensure cache and db are clean
    await redisPub.flushdb();
    await redisSub.flushdb();
    await BridgeClaim.deleteMany({});
    await ClaimEvents.deleteMany({});
  });

  after(async () => {
    await api.disconnect();
    await mongoose.connection.close();
    await redisSub.disconnect();
    await redisPub.disconnect();
    provider.removeAllListeners();
  })

  describe('Deposit Publisher', () => {
    it('Should publish Message into Redis when Deposit occurs', (done ) => {
      //setup redis to listen for pubs
      redisSub.subscribe(TOPIC_CENNZnet_CONFIRM, (err, count) => {
        if (err) {
          console.error("Failed to subscribe: %s", err.message);
        } else {
          console.info(
              `Subscribed successfully! This client is currently subscribed to ${count} channels.`
          );
        }
      });
      redisSub.once("message", async (channel, message) => {
        expect(channel).equal(TOPIC_CENNZnet_CONFIRM);
        expect(Object.keys(JSON.parse(message)).length).greaterThan(0);
        redisSub.unsubscribe(TOPIC_CENNZnet_CONFIRM);
        redisSub.quit();
        done();
      });
      mainPublisher("local", erc20Peg.address, provider, api, redisPub).then(async () => {
        let depositAmount = 7;
        let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
        await erc20Peg.activateDeposits();
        await testToken.approve(erc20Peg.address, depositAmount);
        await erc20Peg.deposit(testToken.address, depositAmount, cennznetAddress);
      });
    });
  })
})
