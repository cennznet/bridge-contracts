import { expect, use } from 'chai';
import { Contract, ethers } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import CENNZnetBridge from '../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json';
import ERC20Peg from '../artifacts/contracts/ERC20Peg.sol/ERC20Peg.json';
import TestToken from '../artifacts/contracts/TestToken.sol/TestToken.json';

use(solidity);

describe('Erc20Peg', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let bridge: Contract;
  let erc20Peg: Contract;
  let testToken: Contract;

  beforeEach(async () => {
    testToken = await deployContract(wallet, TestToken, [1000000]);
    bridge = await deployContract(wallet, CENNZnetBridge, []);
    erc20Peg = await deployContract(wallet, ERC20Peg, [bridge.address]);
  });

  it('deposits/withdrawals disabled on init', async () => {
    expect(!await erc20Peg.depositsActive)
    expect(!await erc20Peg.withdrawalsActive)
  });

  it('deposit active/pause', async () => {
    await erc20Peg.activateDeposits();
    expect(await erc20Peg.depositsActive)

    await erc20Peg.pauseDeposits();
    expect(!await erc20Peg.depositsActive)
  });

  it('withdrawals active/pause', async () => {
    await erc20Peg.activateWithdrawals();
    expect(await erc20Peg.withdrawalsActive)

    await erc20Peg.pauseWithdrawals();
    expect(!await erc20Peg.withdrawalsActive)
  });

  it('erc20 deposit', async () => {
    let depositAmount = 7;
    let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
    let userBalanceStart = await testToken.balanceOf(wallet.address);
    await erc20Peg.activateDeposits();
    await testToken.approve(erc20Peg.address, depositAmount);

    await expect(
      erc20Peg.deposit(testToken.address, depositAmount, cennznetAddress)
    ).to.emit(erc20Peg, 'Deposit').withArgs(wallet.address, testToken.address, depositAmount, cennznetAddress);

    // Check peg contract has funds
    expect(await testToken.balanceOf(erc20Peg.address)).to.equal(depositAmount);
    let userBalanceEnd = await testToken.balanceOf(wallet.address);
    expect(userBalanceEnd).to.equal(userBalanceStart - depositAmount);
  });

  it('native eth deposit', async () => {
    let depositAmount = 12345;
    let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
    await erc20Peg.activateDeposits();
    let ethTokenAddress = await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS();
    expect(ethTokenAddress).to.equal('0x0000000000000000000000000000000000000000');

    let userEthStart = await erc20Peg.provider.getBalance(wallet.address);

    await expect(
      erc20Peg.deposit(ethTokenAddress, depositAmount, cennznetAddress, { value: depositAmount })
    ).to.emit(erc20Peg, 'Deposit').withArgs(wallet.address, ethTokenAddress, depositAmount, cennznetAddress);

    // Check peg contract has eth
    let pegEthBalance = await erc20Peg.provider.getBalance(erc20Peg.address);
    expect(pegEthBalance).to.equal(depositAmount);
    let userEthEnd = await erc20Peg.provider.getBalance(wallet.address);
    expect(userEthEnd.lt(userEthStart.sub(depositAmount)));
    // final balance is start - deposit amount - gas fees
    // expect(userEthEnd.toNumber() < (userEthStart.toNumber() - depositAmount));
  });

  it('deposit, peg inactive', async () => {
    await testToken.approve(erc20Peg.address, 7);

    await expect(
      erc20Peg.deposit(testToken.address, 7, '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10')
    ).to.be.revertedWith('deposits paused');
  });

  it('native eth deposit invalid amount', async () => {
    let depositAmount = 7777;
    let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
    await erc20Peg.activateDeposits();
    let ethTokenAddress = await erc20Peg.ETH_RESERVED_TOKEN_ADDRESS();

    await expect(
      erc20Peg.deposit(ethTokenAddress, depositAmount, cennznetAddress, { value: depositAmount - 1 })
    ).to.be.revertedWith('incorrect deposit amount');
  });

  it('erc20 deposit, no approval', async () => {
    await erc20Peg.activateDeposits();

    await expect(
      erc20Peg.deposit(testToken.address, 7, '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10')
    ).to.be.reverted;
  });

});
