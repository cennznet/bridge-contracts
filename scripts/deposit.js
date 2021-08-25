// Deposit some ERC20 token to the CENNZnet bridge contract
async function main() {
    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach("0x5fbdb2315678afecb367f032d93f642f64180aa3");
    await bridge.deployed();

    console.log('Connecting to test erc20 contract...');
    const TestToken = await ethers.getContractFactory('TestToken');
    const token = await TestToken.attach("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");
    console.log(`connected. bridge: ${bridge.address}, token: ${token.address}`);

    // Make  deposit
    let depositAmount = 5644;
    let cennznetAddress = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    console.log(await token.approve(bridge.address, depositAmount));
    console.log(await bridge.deposit(token.address, depositAmount, cennznetAddress));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
