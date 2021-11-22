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
import { keccak256 } from '@ethersproject/keccak256';

use(solidity);

async function setTime(seconds: BigNumber) {
  await hre.network.provider.send('evm_increaseTime', [seconds.toNumber()]);
  await hre.network.provider.send('evm_mine', []);
}

describe('Timelock', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let bridge: Contract;
  let timeLock: Contract;
  let threeDays = new BigNumber(86400 * 3);
  let minimumDelay = threeDays;
  // this value is arbitrary
  // the block timestamp will be manipulated in these tests relative to this
  let initialBlockTimestamp = new BigNumber(100);
  let abi = new ethers.utils.AbiCoder();

  beforeEach(async () => {
    timeLock = await deployContract(wallet, Timelock, [wallet.address, minimumDelay.toNumber()]);
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    await setTime(initialBlockTimestamp);
    await bridge.transferOwnership(timeLock.address);
  });

  it('issues a function w delay', async () => {
    let delay = minimumDelay;
    let newMaxRewardPayout = new BigNumber('12345789');
    let signature = 'setMaxRewardPayout(uint256)';
    let encodedParams = abi.encode(['uint256'], [newMaxRewardPayout.toString()]);
    let blockNumAfter = await ethers.provider.getBlockNumber();
    let blockAfter = await ethers.provider.getBlock(blockNumAfter);
    let timestampAfter = blockAfter.timestamp;

    let eta = new BigNumber(timestampAfter).plus(delay).plus(new BigNumber(1));

    let queuedTxHash = keccak256(
      abi.encode(
        ['address', 'uint256', 'string', 'bytes', 'uint256'],
        [bridge.address, 0, signature, encodedParams, eta.toString()]
      )
    );

    await timeLock.queueTransaction(bridge.address, 0, signature, encodedParams, eta.toString());
    blockNumAfter = await ethers.provider.getBlockNumber();
    blockAfter = await ethers.provider.getBlock(blockNumAfter);
    timestampAfter = blockAfter.timestamp;
    await hre.network.provider.send("evm_setNextBlockTimestamp", [new BigNumber(timestampAfter).plus(delay).plus(2).toNumber()])
    await timeLock.executeTransaction(bridge.address, 0, signature, encodedParams, eta.toString(), {
      // Prevents error: 'cannot estimate gas; transaction may fail or may require manual gas limit'
      gasLimit: 100000});

    await expect(bridge.maxRewardPayout === newMaxRewardPayout);
  });

})
;
