import { expect, use } from 'chai';
import { Contract, ethers } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import ERC20Peg from '../artifacts/contracts/ERC20Peg.sol/ERC20Peg.json';
import MockBridge from '../artifacts/contracts/MockBridge.sol/MockBridge.json';
import WrappedCENNZ from '../artifacts/contracts/WrappedCENNZ.sol/WrappedCENNZ.json';
import { keccak256 } from 'ethers/lib/utils';

use(solidity);

describe('Erc20Peg', () => {
    const [wallet, walletTo] = new MockProvider().getWallets();
    let erc20Peg: Contract;
    let mockBridge: Contract;
    let wrappedCENNZ: Contract;
    // use with mockBridge to withdraw tokens
    let FAKE_WITHDRAW_PROOF = {
        eventId: 1,
        validatorSetId: 0,
        validators: [],
        v: [],
        r: [],
        s: [],
    };

    beforeEach(async () => {
        mockBridge = await deployContract(wallet, MockBridge, []);
        erc20Peg = await deployContract(wallet, ERC20Peg, [mockBridge.address]);
        await erc20Peg.activateWithdrawals();
        wrappedCENNZ = await deployContract(wallet, WrappedCENNZ, [erc20Peg.address]);
    });

    it('withdraw wrapped CENNZ then deposit', async () => {
        let withdrawalAmount = 10;
        let userBalanceStart = await wrappedCENNZ.balanceOf(wallet.address);
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            FAKE_WITHDRAW_PROOF,
            {
                gasLimit: 500000,
            }
        );
        console.log(`withdraw gas: ${estimatedGas}`);

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                FAKE_WITHDRAW_PROOF,
                {
                    gasLimit: estimatedGas,
                })
        ).to.emit(erc20Peg, 'Withdraw').withArgs(wallet.address, wrappedCENNZ.address, withdrawalAmount);

        // Check wallet has funds
        let userBalanceAfterWithdrawal = await wrappedCENNZ.balanceOf(wallet.address);
        expect(userBalanceAfterWithdrawal).to.equal(userBalanceStart + withdrawalAmount);

        // DEPOSIT
        let depositAmount = 5;
        let cennznetAddress = '0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10';
        await erc20Peg.activateDeposits();

        estimatedGas = await erc20Peg.estimateGas.deposit(
            wrappedCENNZ.address,
            depositAmount,
            cennznetAddress,
            {
                gasLimit: 500000,
            }
        );
        console.log(`deposit gas: ${estimatedGas}`);

        await expect(
            erc20Peg.deposit(
                wrappedCENNZ.address,
                depositAmount,
                cennznetAddress,
                {
                    gasLimit: estimatedGas,
                })
        ).to.emit(erc20Peg, 'Deposit').withArgs(wallet.address, wrappedCENNZ.address, depositAmount, cennznetAddress);

        // Check account has correct funds
        let userBalanceAfterDeposit = await wrappedCENNZ.balanceOf(wallet.address);
        expect(userBalanceAfterDeposit).to.equal(userBalanceAfterWithdrawal - depositAmount);
    });

    it('transfer wrapped CENNZ', async () => {
        let withdrawalAmount = 10;
        let userBalanceStart = await wrappedCENNZ.balanceOf(wallet.address);
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            FAKE_WITHDRAW_PROOF,
            {
                gasLimit: 500000,
            }
        );

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                FAKE_WITHDRAW_PROOF,
                {
                    gasLimit: estimatedGas,
                })
        ).to.emit(erc20Peg, 'Withdraw').withArgs(wallet.address, wrappedCENNZ.address, withdrawalAmount);

        // Check wallet has funds
        let userBalanceAfterWithdrawal = await wrappedCENNZ.balanceOf(wallet.address);
        expect(userBalanceAfterWithdrawal).to.equal(userBalanceStart + withdrawalAmount);

        let transferAmount = 10;
        let recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d';
        expect(recipient).not.equals(wallet.address);
        let recipientBalanceBeforeTransfer = await wrappedCENNZ.balanceOf(recipient);
        expect(recipientBalanceBeforeTransfer).to.equal(0);

        await wrappedCENNZ.transfer(
            recipient,
            transferAmount
        );

        // Check funds have transferred correctly
        expect(await wrappedCENNZ.balanceOf(recipient)).to.equal(recipientBalanceBeforeTransfer + transferAmount);
        expect(await wrappedCENNZ.balanceOf(wallet.address)).to.equal(userBalanceAfterWithdrawal - transferAmount);
    });

    it('approve and transfer wrapped CENNZ', async () => {
        let withdrawalAmount = 10;
        let userBalanceStart = await wrappedCENNZ.balanceOf(wallet.address);
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        // TEST
        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                FAKE_WITHDRAW_PROOF,
            )
        ).to.emit(erc20Peg, 'Withdraw').withArgs(wallet.address, wrappedCENNZ.address, withdrawalAmount);

        // Check wallet has funds
        let userBalanceAfterWithdrawal = await wrappedCENNZ.balanceOf(wallet.address);
        expect(userBalanceAfterWithdrawal).to.equal(userBalanceStart + withdrawalAmount);

        let transferAmount = 9;
        let recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d';

        expect(recipient).not.equals(wallet.address);
        let recipientBalanceBeforeTransfer = await wrappedCENNZ.balanceOf(recipient);
        expect(recipientBalanceBeforeTransfer).to.equal(0);

        await wrappedCENNZ.approve(
            walletTo.address,
            transferAmount
        );
        const approvedAccount = wrappedCENNZ.connect(walletTo);

        await approvedAccount.transferFrom(
            wallet.address,
            recipient,
            transferAmount,
        );

        // Check funds have transferred correctly
        expect(await wrappedCENNZ.balanceOf(recipient)).to.equal(recipientBalanceBeforeTransfer + transferAmount);
        expect(await wrappedCENNZ.balanceOf(wallet.address)).to.equal(userBalanceAfterWithdrawal - transferAmount);
    });

    it('only minter role can mint & burn', async () => {
        let minterRole = keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
        await expect(
            wrappedCENNZ.mint(wallet.address, 1000)
        ).to.be.revertedWith(`AccessControl: account 0x17ec8597ff92c3f44523bdc65bf0f1be632917ff is missing role ${minterRole}`);

        await expect(
            wrappedCENNZ.mint(wallet.address, 1000)
        ).to.be.revertedWith(`AccessControl: account 0x17ec8597ff92c3f44523bdc65bf0f1be632917ff is missing role ${minterRole}`);
    });

    it('pause & unpause', async () => {
        // setup
        let withdrawalAmount = 100;
        await erc20Peg.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            FAKE_WITHDRAW_PROOF,
        );
        await erc20Peg.activateDeposits();

        // pause transfer/deposit/withdraw fails
        await wrappedCENNZ.pause();
        await expect(
            wrappedCENNZ.transfer(wallet.address, 2)
        ).to.reverted.returned;
        await expect(
            erc20Peg.withdraw(
            wrappedCENNZ.address,
            5,
            wallet.address,
            FAKE_WITHDRAW_PROOF,
        )).to.reverted.returned;
        await expect(
            erc20Peg.deposit(
                wrappedCENNZ.address,
                5,
                '0x0903fdd2dea80c6e24743f8363044948447689d3e8f19a4c63046ff8f2150281',
            )
        ).to.reverted.returned;

        // unpause transfer ok
        await wrappedCENNZ.unpause();
        let recipient = '0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d';
        let beforeBalance = await wrappedCENNZ.balanceOf(recipient);
        await wrappedCENNZ.transfer(recipient, 3)
        expect(await wrappedCENNZ.balanceOf(recipient)).to.equal(beforeBalance + 3);
    });
});
