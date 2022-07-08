const prompt = require('prompt');
const { ethers } = require('hardhat');
const { Api } = require('@cennznet/api');
const {MAINNET_V2} = require('../src/deployments');

// Withdraw tokens from peg contract using an existing proof
async function main() {

    prompt.start();
    //const {proofId, amount, recipient} = await prompt.get(['proofId', 'amount', 'recipient']);
    const proofId = 433;
    const amount = '0x000000000000000006b6f02b9734fff4';
    const recipient = '0x8b7f8afef51534bb860900433ed69f282f070ef8';
    const tokenAddress = ethers.constants.AddressZero;
    console.log(`claim withdrawal for:\nrecipient:${recipient},\namount:${amount},\ntoken:${tokenAddress}`);
    console.log(`on mainnet / mainnet`);
    const answer = await prompt.get(['y/n?']);
    if(answer['y/n?'] !== 'y') {
       throw new Error('cancelled withdrawal, exiting...');
    }

    // connect to CENNZnet
    const api = await Api.create({network: 'azalea'});

    const erc20Peg = await ethers.getContractFactory('ERC20Peg');
    const peg = await erc20Peg.attach(MAINNET_V2.peg);
    await peg.deployed();
    console.log('CENNZnet erc20peg deployed to:', peg.address);

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    const bridge = await Bridge.attach(MAINNET_V2.bridge);
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);
    let verificationFee = await bridge.verificationFee();

    // query and extract proof from CENNZnet
    let eventProof;
    const versionedEventProof = (await api.rpc.ethy.getEventProof(proofId)).toJSON();
    if (versionedEventProof !== null) {
        eventProof = versionedEventProof.eventProof;
    }

    if(!eventProof) {
        throw new Error("proof not found");
    }

    // Make  withdraw for beneficiary
    let v = [], r = [], s = []; // signature params
    eventProof.signatures.map((signature) => {
        const hexifySignature = ethers.utils.hexlify(signature);
        const sig = ethers.utils.splitSignature(hexifySignature);
        v.push(sig.v);
        r.push(sig.r);
        s.push(sig.s);
    });

    // query the validator addresses for you proof
    const validators = [
            '0x177ecfe2f44f2a79f2f5ac1c7e797f78d4f69f78',
            '0x6c4064aaeaef4c730a69a0289665bc14394588f9',
            '0x9701f1a818c80a3432439c44afc1c71d7e6afca6',
            '0x01bbc765e5c0e2be83757f7be1e0fa096365d95f',
            '0xcde551215f494d2dd767cf485190cc90f9905a32',
            '0x49019ae4de9476e094016340ef06bc25e56e845b',
            '0x1121f24105bb9d01b69048c96476ed15beba8f87',
            '0x26c8fd982d8405d76e67776699311226e12e4740',
            '0x738436669adb1b82a26ae6f3e7c940605ed75f77',
            '0xa5b0f642726b174cbdd29496a2850f922cefcf34',
            '0xc43589e5fa02ef18e2ec0334af39b5788f805a2f',
            '0x5e45ddbda199a835acffac5e32e6c9d94bfdff61',
            '0x577c3368d5e1bbc7387f6df21a6c3740e70f7e64',
            '0x9e4e381e3437578a7641d01ba088c6e4465b3bf9',
            '0xa6a3a5a94607cad78dd0268784419589cb638fcb',
            '0x0f040909a5b95c3b6d7797eb353e80d745f748d2',
            '0x3bc5b0fa1889647c54c24c836e03d06b9fa15368',
            '0x47676b8fc211394115de3f52c7ea9fd5e95f93a3',
            '0x28161b6c51a301dd1cb99b2801f0cb294346b080',
            '0x90b2280195e7cd93a485bebcec7470831a553cd8',
            '0xbf1d9966154fe3a95c4c9c24bca6bac95780ee91',
            '0xec550f384e2597c75e04a639da7a7db9ee7291af',
            '0x51eac5f571b49c84ecfb53e99922512f81a2564a',
            '0x6eae37ca97e261c681f278bd4e7af3d53ceaa2f2',
            '0x8db2f517c938f104e95268e1a0e5b8e0f3e2568c',
            '0x1e7fe213a0af9bc5269313ec026719de95b9bf0a',
            '0xf878149f6aafd098c188e158e4bb15552931d81d',
            '0x3dff3c63cebf8271d435935b5b20924c5c13e8b6',
            '0xe2f2154cb56c69d50b889d874c7060c4d8fd9b19',
            '0x581ca4019facf6f898075eaf5f322979a7902cdc',
            '0x107f1ee8412038bb883cdb3d5c44f0ec76160b7e',
            '0x3563698ab4ee172c89a2c3fc9813b7967e545239',
            '0x52c52402984256122dd9bc196e49bf905e118bfa',
            '0x54953b0584b0f07515a53654ab49c655aa39f622',
            '0x6c55dbf811e00629f117b742cee898669307cddf',
            '0x3644ece3e899b5dcc913a4de957d1f5245291efa',
            '0x23f39c46ffae5df598fa87cb142ef949c6b65535',
            '0xd177482d684b4b17a19d69820956f63e9a430167',
            '0x122d785a86f54da45129ae968fd8cb6d1f6807e7',
            '0xb7a2118c4f72287c9224883ae02f4ef0325adbe1',
            '0xfe48077c5ac28209214dcc295ed9d14b92bb22e8',
            '0x8cddef39cd29b504b204347cfba0a3f45025510e',
            '0x28b074b0a07cef4ba56f2497941d0368e4545a7a',
            '0x7fea4a19e16e6ec7efe091c0e9c4128ea499bc32',
            '0x83487230dec9d2b71619aa7b81cff63a35d0cb2b',
            '0xf33b069514a5e93c1ee845f65186af0913321452',
            '0x4238ad347cecaa407739b745f791180e9f0871b9',
            '0xf61067021a7cdc23e6c1f196efa03cc7e16ce7eb',
            '0x066997860ff5e7396e036d9fd43efcc56c15202b',
            '0xa698369e18adf7d5ca3aeac84798f0d72c47dda1'
    ];
    console.log('make sure the proof validators addresses (ethBridge.notaryKeys) match');
    console.log(validators);
    const validatorsAnswer = await prompt.get(['y/n?']);
    if(validatorsAnswer['y/n?'] !== 'y') {
       throw new Error('cancelled withdrawal, exiting...');
    }

    let estimatedGas = await peg.estimateGas.withdraw(tokenAddress, amount, recipient,
        {
            eventId: eventProof.eventId,
            validatorSetId: eventProof.validatorSetId,
            v,
            r,
            s,
            validators,
        },
        {
            gasLimit: 500000,
            value: verificationFee
        }
    );
    console.log(estimatedGas.toNumber());
    // let receipt = await peg.withdraw(tokenAddress, amount, recipient,
    //     {
    //         eventId: eventProof.eventId,
    //         validatorSetId: eventProof.validatorSetId,
    //         v,
    //         r,
    //         s,
    //         validators,
    //     },
    //     {
    //         gasLimit: estimatedGas,
    //         value: verificationFee
    //     }
    // );
    // console.log(receipt);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
