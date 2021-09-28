const { ethers } = require("hardhat");
// Deposit some ERC20 token to the CENNZnet bridge contract
async function main() {
    const erc20Peg = await ethers.getContractFactory('ERC20Peg');
    console.log('Connecting to CENNZnet erc20peg contract...');
    const peg = await erc20Peg.attach("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
    await peg.deployed();
    console.log('CENNZnet erc20peg deployed to:', peg.address);

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);

    console.log('Connecting to test erc20 contract...');
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.attach("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
    console.log(`connected. bridge: ${peg.address}, token: ${token.address}`);

    const TestToken2 = await ethers.getContractFactory('TestToken2');
    const token2 = await TestToken2.attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9");
    console.log(`Token2 : ${token2.address}`);


    const notaryKeys = '0x0204dad6fc9c291c68498de501c6d6d17bfe28aee69cfbf71b2cc849caafcb0159';
    let decompressedPk = ethers.utils.computePublicKey(notaryKeys);
    console.log(decompressedPk);
    // https://github.com/ethers-io/ethers.js/issues/670#issuecomment-559596757
    let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
    let ethAdd = '0x' + h.slice(26)

    let verificationFee = await bridge.verificationFee();

    console.log('Force validators to ethbridges notaryKeys');
    // Set validators before withdrawal
    console.log(await bridge.forceSetValidators([ethAdd], 0));

    // Activate withdrawals
    console.log(await peg.activateWithdrawals());

    // Check beneficiary balance before first withdrawal
    const beneficiary1 = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
    let balanceBefore = await token2.balanceOf(beneficiary1);
    console.log(`${beneficiary1} Beneficiary1 ERC20 token balance before:`, balanceBefore.toString());

    // Make  withdraw for beneficiary1
    let withdrawAmount = 5644;
    let signature = ethers.utils.hexlify("0x12ff73ebe5afa9f631a7134f5973015544fef30416ce046a7958d8818da1cc175227e6183e9751f1b0dd98a768ac7d3ab40cb5a7ff30c669895077bab687003d01");
    let sig = ethers.utils.splitSignature(signature);
    console.log(await peg.withdraw(token2.address, withdrawAmount, beneficiary1, {eventId: 0, validatorSetId: 0,
            v: [sig.v],
            r: [sig.r],
            s: [sig.s]
        },
        {
            gasLimit: 500000,
            value: verificationFee
        }
    ));

    // Check beneficiary balance after first withdrawal
    let balanceAfter = await token2.balanceOf(beneficiary1);
    console.log('Beneficiary1 ERC20 token balance after first withdrawal:', balanceAfter.toString());


    // Check beneficiary balance before second withdrawal
    const beneficiary2 = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
    balanceBefore = await token2.balanceOf(beneficiary2);
    console.log(`${beneficiary2} Beneficiary2 ERC20 token balance before second withdrawal:`, balanceBefore.toString());

    // Make another withdraw for beneficiary2
    withdrawAmount = 11644;

    signature = ethers.utils.hexlify("0x22922ebc9255c7c6d9f22ee487727d89d0c50b4c37d9f6cbd555456970e2614b0cd32074575124463c4ee81eb22cb06a99e4afffef61f1e1af7800234233877f01");
    sig = ethers.utils.splitSignature(signature);
    console.log(await peg.withdraw(token2.address, withdrawAmount, beneficiary2, {
        eventId: 1, validatorSetId: 0,
            v: [sig.v],
            r: [sig.r],
            s: [sig.s]
        },
        {
            gasLimit: 500000,
            value: verificationFee
        }
    ));

    // Check beneficiary balance after second withdrawal
    balanceAfter = await token2.balanceOf(beneficiary2);
    console.log('Beneficiary2 ERC20 token balance after second withdrawal:', balanceAfter.toString());

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
