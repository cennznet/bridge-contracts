import { expect, use } from 'chai';
import hre from 'hardhat';
import { Contract, utils } from 'ethers';
const { ethers } = require('hardhat');
import { BigNumber } from 'bignumber.js';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
// @ts-ignore
import Timelock from '../artifacts/contracts/Timelock.sol/Timelock.json';
// @ts-ignore
import CENNZnetBridge from '../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json';

use(solidity);

async function setTime(seconds: BigNumber) {
  await hre.network.provider.send('evm_increaseTime', [seconds.toNumber()]);
  await hre.network.provider.send('evm_mine', []);
}

describe('Timelock', () => {
  let bridge: Contract;
  let timeLock: Contract;
  let threeDays = new BigNumber(86400 * 3);
  let minimumDelay = threeDays;
  // this value is arbitrary
  // the block timestamp will be manipulated in these tests relative to this
  let initialBlockTimestamp = new BigNumber(100);
  let abi = new ethers.utils.AbiCoder();

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Deploying CENNZnet bridge contract...');
    bridge = await Bridge.deploy();
    await bridge.deployed();

    const TimeLock = await ethers.getContractFactory('Timelock');
    console.log('Deploying CENNZnet bridge contract...');
    timeLock = await TimeLock.deploy(deployer.address, minimumDelay.toNumber());
    await timeLock.deployed();
    console.log('timeLock deployed to:', timeLock.address);
    await setTime(initialBlockTimestamp);
    await bridge.transferOwnership(timeLock.address);
  });

  it('issues a function w delay', async () => {
    let delay = minimumDelay;
    let newMaxRewardPayout = new BigNumber('52345789');
    let signature = 'setMaxRewardPayout(uint256)';
    let encodedParams = abi.encode(['uint256'], [newMaxRewardPayout.toString()]);
    let blockNumAfter = await ethers.provider.getBlockNumber();
    let blockAfter = await ethers.provider.getBlock(blockNumAfter);
    let timestampAfter = blockAfter.timestamp;
    console.log('timestampAfter::',timestampAfter);

    let eta = new BigNumber(timestampAfter).plus(delay).plus(new BigNumber(1));

    console.log('eta:::',eta.toString());

    await timeLock.queueTransaction(bridge.address, 0, signature, encodedParams, eta.toNumber());


    await ethers.provider.send('evm_setNextBlockTimestamp', [eta.plus(1).toNumber()]);
    await ethers.provider.send('evm_mine');
    blockNumAfter = await ethers.provider.getBlockNumber();
    blockAfter = await ethers.provider.getBlock(blockNumAfter);
    timestampAfter = blockAfter.timestamp;
    console.log('timestampAfter::',timestampAfter);
    console.log('eta::', eta.toString());
    await timeLock.executeTransaction(bridge.address, 0, signature, encodedParams, eta.toNumber(), {
      // Prevents error: 'cannot estimate gas; transaction may fail or may require manual gas limit'
      gasLimit: 100000
    });
    const payout = await bridge.maxRewardPayout();
    console.log('Payout::',payout.toString());
    await expect(payout.toString()).equal(newMaxRewardPayout.toString())//.toE === newMaxRewardPayout);
  });

})
;
