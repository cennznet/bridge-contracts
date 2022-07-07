const prompt = require('prompt');
const { ethers } = require('hardhat');
const { Api } = require('@cennznet/api');
const {MAINNET_V2} = require('../src/deployments');

// Withdraw tokens from peg contract using an existing proof
async function main() {

    prompt.start();
    const {proofId, amount, recipient} = await prompt.get(['proofId', 'amount', 'recipient']);
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
        "0x177ecfe2f44f2a79f2f5ac1c7e797f78d4f69f78",
        "0x6c4064aaeaef4c730a69a0289665bc14394588f9",
        "0x9701f1a818c80a3432439c44afc1c71d7e6afca6",
        "0x22f9bd4ab46ab35ff18f8f46af52b719b5d31cef",
        "0xcde551215f494d2dd767cf485190cc90f9905a32",
        "0x01bbc765e5c0e2be83757f7be1e0fa096365d95f",
        "0xa5b0f642726b174cbdd29496a2850f922cefcf34",
        "0x49019ae4de9476e094016340ef06bc25e56e845b",
        "0xe34c9889b7cf513aac0d75f3c82ca6990f0636f9",
        "0x1121f24105bb9d01b69048c96476ed15beba8f87",
        "0xef20a49d88d2dadb5ab6a8efdfe1948c114732ce",
        "0x26c8fd982d8405d76e67776699311226e12e4740",
        "0x537537cce21908266e98c0fc4c3a7bc55c582acf",
        "0x0000000000000000000000000000000000000000",
        "0xa3eb2cf9ff0237930e0d0134c439ced469226a69",
        "0xa0cfc394d67de6077457b8d9985366ca6a368c0c",
        "0x496d7619a43da371f50137590fcdc17b68ff5a36",
        "0x1fcab0ed063b5f6f008de15c1ab2519acdcb4869",
        "0x5d2ccb58166e2808698239487b9385544cc9a7b0",
        "0x28161b6c51a301dd1cb99b2801f0cb294346b080",
        "0x922215a0e87957f49b28228df2293c5cea7f8288",
        "0x9067af036f6b5b320e78b20b7392503765cbff2a",
        "0xec550f384e2597c75e04a639da7a7db9ee7291af",
        "0x4b3a72bc3c0fe0b414201f069f299fcb02f2b039",
        "0x6870742a27ab0cb07dae791dff669a2279d2d02b",
        "0x506b0fe204d79ba9a50fa817c0a9444a86e5875a",
        "0x51eac5f571b49c84ecfb53e99922512f81a2564a",
        "0x0a47e9ece7ca65757c9f290504a9960fb65bbbae",
        "0xb7a2118c4f72287c9224883ae02f4ef0325adbe1",
        "0xbd67f72a924fb706f392ce481f8235ea23bacf74",
        "0xd8a9c7a4912276410a1b7bd1e9507da8efab5f3c",
        "0x107f1ee8412038bb883cdb3d5c44f0ec76160b7e",
        "0x3aa7c5811cb0de232056b7f185717c405665292e",
        "0x734c87a9e4cabbdf8ee36d63e87b204fb83ab314",
        "0x8aef0126200a64a8c0664eeb77ce0f6096b5750d",
        "0x3e325fe8285e80a70dcb4044e41dc250e7493e05",
        "0xb53ebfd432032375b96059edd46e84298e466f92",
        "0x43ead6aaa95ce9e911f8ec0e57169a72936b7d7f",
        "0x0817f027d521f626d4d60282a3508ca4b00bfdef",
        "0x3644ece3e899b5dcc913a4de957d1f5245291efa",
        "0x83487230dec9d2b71619aa7b81cff63a35d0cb2b",
        "0xe2f2154cb56c69d50b889d874c7060c4d8fd9b19",
        "0x6c55dbf811e00629f117b742cee898669307cddf",
        "0x4425e52259ba7313d3b73ecb2620e77370b89523",
        "0x6fe4d8e59c21efde4cd47d2bd8aba1cc2156a14f",
        "0xd177482d684b4b17a19d69820956f63e9a430167",
        "0x4238ad347cecaa407739b745f791180e9f0871b9",
        "0x4d8421d9351474f3566d877c9742b25689883a99",
        "0xf61067021a7cdc23e6c1f196efa03cc7e16ce7eb",
        "0x5198db2c51da5e2870b4a55743b0a9e2dd8c60e2",
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
    let receipt = await peg.withdraw(tokenAddress, amount, recipient,
        {
            eventId: eventProof.eventId,
            validatorSetId: eventProof.validatorSetId,
            v,
            r,
            s,
            validators,
        },
        {
            gasLimit: estimatedGas,
            value: verificationFee
        }
    );
    console.log(receipt);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
