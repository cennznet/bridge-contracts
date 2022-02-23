import { expect, use } from 'chai';
import hre from 'hardhat';
import { Contract, utils } from 'ethers';
const { ethers } = require('hardhat');
import { BigNumber } from 'bignumber.js';
import { solidity } from 'ethereum-waffle';

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
    console.log('Payout::', payout.toString());
    await expect(payout.toString()).equal(newMaxRewardPayout.toString());
  });

  it('issues a force active validator set function w delay', async () => {
    let delay = minimumDelay;

    let validatorSetId = 1;

    // Public Key from CENNZnet: 0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159
    let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
    let validatorAddress = utils.computeAddress(validatorPublicKey);

    let signature = 'forceActiveValidatorSet(address[],uint32)';
    // 'Alice' default CENNZnet ECDSA public key converted to Eth address
    const addressArr = [validatorAddress];
    console.log('addressArr::', addressArr);
    let encodedParams = abi.encode(['address[]', 'uint32'], [addressArr, validatorSetId]);
    console.log('Encoded params:', encodedParams);
    let decode = abi.decode(['address[]', 'uint32'], encodedParams);
    console.log('Decoded params:', decode);
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
      gasLimit: 1000000
    });
    const activeValidatorSetId = await bridge.activeValidatorSetId();
    console.log('activeValidatorSetId::',activeValidatorSetId.toString());
    await expect(activeValidatorSetId.toString()).equal(validatorSetId.toString());
    const validatorSetDigest = await bridge.validatorSetDigests(activeValidatorSetId);
    console.log('Validators::', validatorSetDigest);
    console.log('addressArr::', addressArr);
  });

})
;
