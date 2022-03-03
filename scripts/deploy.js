const { ethers } = require("hardhat");
// deploy contracts for test
async function main() {
  const Bridge = await ethers.getContractFactory("CENNZnetBridge");
  console.log("Deploying CENNZnet bridge contract...");
  const bridge = await Bridge.deploy();
  await bridge.deployed();
  console.log("CENNZnet bridge deployed to:", bridge.address);

  const erc20Peg = await ethers.getContractFactory("ERC20Peg");
  console.log("Deploying ERC20Peg contract...");
  const peg = await erc20Peg.deploy(bridge.address);
  await peg.deployed();
  console.log("CENNZnet erc20peg deployed to:", peg.address);

  const WrappedCennz = await ethers.getContractFactory("WrappedCENNZ");
  console.log("Deploying CENNZnet WrappedCENNZ contract...");
  const wrappedCennz = await WrappedCennz.deploy(erc20Peg.address);
  await wrappedCennz.deployed();
  console.log("CENNZnet WrappedCENNZ deployed to:", wrappedCennz.address);

  const TestToken = await ethers.getContractFactory("TestToken");
  console.log("Deploying TestToken contract...");
  const token = await TestToken.deploy(ethers.utils.parseUnits("1000000"));
  await token.deployed();
  console.log("TestToken deployed to:", token.address);

  const TestToken2 = await ethers.getContractFactory("TestToken2");
  console.log("Deploying TestToken2 contract...");
  const token2 = await TestToken2.deploy(ethers.utils.parseUnits("5000000"));
  await token2.deployed();
  console.log("TestToken2 deployed to:", token2.address);

  // Make  deposit
  let depositAmount = 1423;
  let cennznetAddress =
    "0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10";
  console.log(await peg.activateDeposits());
  console.log(await token.approve(peg.address, depositAmount));
  console.log(await peg.deposit(token.address, depositAmount, cennznetAddress));

  let depositAmount2 = 5644;
  // Alice
  let cennznetAddress2 =
    "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
  console.log(await token2.approve(peg.address, depositAmount2));
  console.log(
    await peg.deposit(token2.address, depositAmount2, cennznetAddress2)
  );

  let depositAmount3 = 11644;
  // Bob
  let cennznetAddress3 =
    "0x8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48";
  console.log(await token2.approve(peg.address, depositAmount3));
  console.log(
    await peg.deposit(token2.address, depositAmount3, cennznetAddress3)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
