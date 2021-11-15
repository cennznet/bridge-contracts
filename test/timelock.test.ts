import { expect, use } from 'chai';
import { Contract, utils } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import Timelock from '../artifacts/contracts/Timelock.sol/Timelock.json';
import CENNZnetBridge from '../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json';

use(solidity);

describe('Timelock', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let bridge: Contract;
  let timeLock: Contract;

  beforeEach(async () => {
    timeLock = await deployContract(wallet, Timelock, []);
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    await bridge.transferOwnership(timeLock.address);
  });

  it('issues a function w delay', async () => {
    
  });

})
