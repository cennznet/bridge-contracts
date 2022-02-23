const { ethers } = require("hardhat");
const { Api } = require('@cennznet/api');
// Deposit some ERC20 token to the CENNZnet bridge contract
async function main() {
    const erc20Peg = await ethers.getContractFactory('ERC20Peg');
    console.log('Connecting to CENNZnet erc20peg contract...');
    // const peg = await erc20Peg.attach("0x8F68fe02884b2B05e056aF72E4F2D2313E9900eC");//mainnet peg addrss
    const peg = await erc20Peg.attach("0x5Ff2f9582FcA1e11d47e4e623BEf4594EB12b30d");//kovan peg addrss
    await peg.deployed();
    console.log('CENNZnet erc20peg deployed to:', peg.address);

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Connecting to CENNZnet bridge contract...');
    // const bridge = await Bridge.attach("0x369e2285CCf43483e76746cebbf3d1d6060913EC"); //mainnet contract address
    const bridge = await Bridge.attach("0x9AFe4E42d8ab681d402e8548Ee860635BaA952C5"); //kovan contract address
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);


    const api = await Api.create({network: process.env.NETWORK});

    const eventProofId = process.env.EVENTPROOFID;

    const versionedEventProof = (await api.rpc.ethy.getEventProof(eventProofId)).toJSON();
    if (versionedEventProof !== null) {
        const eventProof = versionedEventProof.EventProof;
        console.log('Event proof found;::', eventProof);
        let verificationFee = await bridge.verificationFee();
        // Make  withdraw for beneficiary
        let withdrawAmount = process.env.WITHDRAW_AMOUNT;
        let tokenAddress = process.env.TOKEN_ADDRESS;
        const signatures = eventProof.signatures;
        let v = [], r = [], s = []; // signature params
        signatures.forEach(signature => {
            const hexifySignature = ethers.utils.hexlify(signature);
            const sig = ethers.utils.splitSignature(hexifySignature);
            v.push(sig.v);
            r.push(sig.r);
            s.push(sig.s);
        });
        const recipient = process.env.RECIPIENT;

        console.log(await peg.withdraw(tokenAddress, withdrawAmount, recipient, {eventId: eventProof.eventId, validatorSetId: eventProof.validatorSetId,
                v,
                r,
                s
            },
            {
                gasLimit: 500000,
                value: verificationFee
            }
        ));
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
