import { expect, use } from 'chai';
import { Contract, utils } from 'ethers';
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

        // SETUP: bridge contract validators
        let validatorPublicKey = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
        let validatorAddress = utils.computeAddress(validatorPublicKey);
        let validatorSetId = 0;
        await bridge.forceActiveValidatorSet(
            // 'Alice' default CENNZnet ECDSA public key converted to Eth address
            [validatorAddress],
            validatorSetId,
        );
        let verificationFee = await bridge.verificationFee();
        // A CENNZnet validator signature for withdraw event: (ETH_RESERVED_TOKEN_ADDRESS, 5644, 0xa86e122EdbDcBA4bF24a2Abf89F5C230b37DF49d)
        let signature = utils.splitSignature(
            utils.hexlify('0x67bb4327409a32ce8acd415a836ba9106d3371281cc8dc646f075c18a21717701b48bd8b57c4193a20acef0c3ab7a6fcc5f7f6b27e199b1a51b38bda857bdc1601')
        );
        let withdrawProof = {
            eventId: 1,
            validatorSetId: 0,
            validators: [validatorAddress],
            v: [signature.v],
            r: [signature.r],
            s: [signature.s],
        };

        // TEST
        let estimatedGas = await erc20Peg.estimateGas.withdraw(
            wrappedCENNZ.address,
            withdrawalAmount,
            wallet.address,
            withdrawProof,
            {
                gasLimit: 500000,
                value: verificationFee
            }
        );

        await expect(
            erc20Peg.withdraw(
                wrappedCENNZ.address,
                withdrawalAmount,
                wallet.address,
                withdrawProof,
                {
                    gasLimit: estimatedGas,
                    value: verificationFee
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
});
