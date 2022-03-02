import { expect, use } from 'chai';
import { Contract, ethers } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import CENNZnetBridge from '../artifacts/contracts/CENNZnetBridge.sol/CENNZnetBridge.json';
import ERC20Peg from '../artifacts/contracts/ERC20Peg.sol/ERC20Peg.json';
import MockBridge from '../artifacts/contracts/MockBridge.sol/MockBridge.json';
import WrappedCENNZ from '../artifacts/contracts/WrappedCENNZ.sol/WrappedCENNZ.json';

use(solidity);

describe('Erc20Peg', () => {
    const [wallet, walletTo] = new MockProvider().getWallets();
    let bridge: Contract;
    let erc20Peg: Contract;
    let mockBridge: Contract;
    let wrappedCENNZ: Contract;

    beforeEach(async () => {
        bridge = await deployContract(wallet, CENNZnetBridge, []);
        mockBridge = await deployContract(wallet, MockBridge, []);
        erc20Peg = await deployContract(wallet, ERC20Peg, [mockBridge.address]);
        wrappedCENNZ = await deployContract(wallet, WrappedCENNZ, [erc20Peg.address]);
    });

    it('withdraw wrapped CENNZ then deposit', async () => {
        let withdrawalAmount = 10;
        let userBalanceStart = await wrappedCENNZ.balanceOf(wallet.address);
        await erc20Peg.activateWithdrawals();
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        let fakeWithdrawProof = {
            eventId: 1,
            validatorSetId: 0,
            validators: [],
            v: [],
            r: [],
            s: [],
        };

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            fakeWithdrawProof,
            {
                gasLimit: 500000,
            }
        );

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                fakeWithdrawProof,
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
        await erc20Peg.activateWithdrawals();
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        let fakeWithdrawProof = {
            eventId: 1,
            validatorSetId: 0,
            validators: [],
            v: [],
            r: [],
            s: [],
        };

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            fakeWithdrawProof,
            {
                gasLimit: 500000,
            }
        );

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                fakeWithdrawProof,
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
        await erc20Peg.activateWithdrawals();
        await wrappedCENNZ.approve(erc20Peg.address, withdrawalAmount);

        let fakeWithdrawProof = {
            eventId: 1,
            validatorSetId: 0,
            validators: [],
            v: [],
            r: [],
            s: [],
        };

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            fakeWithdrawProof,
            {
                gasLimit: 500000,
            }
        );

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                fakeWithdrawProof,
                {
                    gasLimit: estimatedGas,
                })
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

        estimatedGas = await approvedAccount.estimateGas.transferFrom(
            wallet.address,
            recipient,
            transferAmount,
            {
                gasLimit: 500000,
            }
        );
        await approvedAccount.transferFrom(
            wallet.address,
            recipient,
            transferAmount,
            {
                gasLimit: estimatedGas
            },
        );

        // Check funds have transferred correctly
        expect(await wrappedCENNZ.balanceOf(recipient)).to.equal(recipientBalanceBeforeTransfer + transferAmount);
        expect(await wrappedCENNZ.balanceOf(wallet.address)).to.equal(userBalanceAfterWithdrawal - transferAmount);
    });
});
