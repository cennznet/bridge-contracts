// Deposit some ERC20 token to the CENNZnet bridge contract
async function main() {
    const erc20Peg = await ethers.getContractFactory('ERC20Peg');
    console.log('Connecting to CENNZnet erc20peg contract...');
    const peg = await erc20Peg.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    await peg.deployed();
    console.log('CENNZnet erc20peg deployed to:', peg.address);

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);

    console.log(await peg.setBridgeAddress(bridge.address));

    console.log('Connecting to test erc20 contract...');
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9");
    console.log(`connected. bridge: ${peg.address}, token: ${token.address}`);

    // Make  deposit
    let depositAmount = 5644;
    let cennznetAddress = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    console.log(await token.approve(peg.address, depositAmount));
    console.log(await peg.deposit(token.address, depositAmount, cennznetAddress));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
