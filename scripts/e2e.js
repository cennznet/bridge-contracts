const { Api } = require('@cennznet/api');
const { Keyring } = require('@polkadot/keyring');

async function main() {

    const [deployer] = await ethers.getSigners();
    console.log('Deployer::',deployer.address);

    /***************** Ethereum Setup starts here **********************/

    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Deploying CENNZnet bridge contract...');
    const bridge = await Bridge.deploy();
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);

    const erc20Peg = await ethers.getContractFactory('ERC20Peg');
    console.log('Deploying ERC20Peg contract...');
    const peg = await erc20Peg.deploy(bridge.address);
    await peg.deployed();
    console.log('CENNZnet erc20peg deployed to:', peg.address);

    const TestToken = await ethers.getContractFactory('TestToken');
    console.log('Deploying TestToken contract...');
    const token = await TestToken.deploy("1000000");
    await token.deployed();
    console.log('TestToken deployed to:', token.address);

    // Activate deposits
    console.log(await peg.activateDeposits());
    // Activate withdrawals
    console.log(await peg.activateWithdrawals());

    /***************** Ethereum Setup ends here **********************/

    /***************** Make Deposit on ETHEREUM **********************/

    let depositAmount = 5644;
    // Alice
    let cennznetAddress = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    console.log(await token.approve(peg.address, depositAmount));
    const deposition = await peg.deposit(token.address, depositAmount, cennznetAddress);
    const depositTxHash = deposition.hash;
    console.log('depositTxHash:::',depositTxHash);



    /***************** CENNZnet Setup **********************/
        // connecting to local chain
    const api = await Api.create();
    const keyring = new Keyring({type: 'sr25519'});
    const alice = keyring.addFromUri('//Alice');

    /********************* Need the following set up *****************************/
    /********************* only for local chain **********************************/
    /********************* wont need this for rata/nikau/azalea ******************/
    const transaction1 = api.tx.erc20Peg.activateDeposits(true);
    const transaction2 = api.tx.erc20Peg.activateWithdrawals(true);
    const transaction3 = api.tx.erc20Peg.setContractAddress(peg.address);
    const transaction4 = api.tx.ethBridge.setEventConfirmations(0); // Hardhat only makes blocks when txs are sent
    const batchBridgeActivationEx = api.tx.utility.batch([
        transaction1,
        transaction2,
        transaction3,
        transaction4
    ]);

    await new Promise(async (resolve, reject) => {
        await api.tx.sudo.sudo(batchBridgeActivationEx).signAndSend(alice, async ({status, events}) => {
            if (status.isInBlock) {
                events.forEach(({phase, event: {data, method, section}}) => {
                    console.log('\t', phase.toString(), `: ${section}.${method}`, data.toString());
                    resolve();
                });
            }
        });
    });
    /********************* Set up complete *******************************************/

    /********** new Token Id that would be minted on deposition at CENNZnet **********/
    const tokenExist = await api.query.erc20Peg.erc20ToAssetId(token.address);
    const testTokenId = tokenExist.isSome ? tokenExist.unwrap() : await api.query.genericAsset.nextAssetId();
    const claim = {
        tokenAddress: token.address,
        amount: depositAmount,
        beneficiary: cennznetAddress
    };

    console.log('testTokenId::', testTokenId.toString());

    /***************** Make Deposit on CENNZnet **********************/
    let eventClaimId;
    await new Promise(async (resolve, reject) => {
        await api.tx.erc20Peg.depositClaim(depositTxHash, claim).signAndSend(alice, async ({status, events}) => {
            if (status.isInBlock) {
                for (const {event: {method, section, data}} of events) {
                    console.log('\t', `: ${section}.${method}`, data.toString());
                    const [, claimer] = data;
                    if (section === 'erc20Peg' && method == 'Erc20Claim' && claimer && claimer.toString() === alice.address) {
                        eventClaimId = data[0];
                        console.log('*******************************************');
                        console.log('Deposit claim on CENNZnet side started for claim Id', eventClaimId.toString());
                        resolve();
                    }
                }
            }
        });
    });


    let eventProofId = null;
    await new Promise(async (resolve, reject) => {
        const unsubHeads = await api.rpc.chain.subscribeNewHeads((lastHeader) => {
            console.log('Waiting till Ethbridge sends a verify event...');
            console.log('Also look for Erc20deposit event to check if deposit claim succeeeded')
            api.query.system.events((events) => {
                // loop through the Vec<EventRecord>
                events.forEach((record) => {
                    // extract the phase, event and the event types
                    const {event} = record;
                    if (event.section === 'erc20Peg' && event.method === 'Erc20Deposit') {
                        const [claimId, , , claimer] = event.data;
                        if (claimId.toString() === eventClaimId.toString() && claimer.toString() === alice.address) {
                            console.log('Deposited claim on CENNZnet side succeeded..');
                        }
                    }
                    if (event.section === 'ethBridge' && event.method === 'Verified') {
                        unsubHeads();
                        resolve();
                    }
                });
            });
        });
    });
    await new Promise(async (resolve, reject) => {
        let amount = depositAmount;
        const ethBeneficiary = deployer.address;
        await api.tx.erc20Peg.withdraw(testTokenId, amount, ethBeneficiary,).signAndSend(alice, async ({status, events}) => {
            if (status.isInBlock) {
                for (const {event: {method, section, data}} of events) {
                    if (section === 'erc20Peg' && method == 'Erc20Withdraw') {
                        eventProofId = data[0];
                        console.log('*******************************************');
                        console.log('Withdraw claim on CENNZnet side successfully');
                        resolve();
                    }
                }
            }
        });
    });

    let eventProof;
    await new Promise(async (resolve, reject) => {
        const unsubHeads = await api.rpc.chain.subscribeNewHeads(async (lastHeader) => {
            console.log(`Waiting till event proof is fetched....`);
            const versionedEventProof = (await api.rpc.ethy.getEventProof(eventProofId)).toJSON();
            if (versionedEventProof !== null) {
                eventProof = versionedEventProof.EventProof;
                console.log('Event proof found;::', eventProof);
                unsubHeads();
                resolve();
            }
        });
    });

    /***************** Make Withdrawal on ETHEREUM **********************/

    // Check beneficiary balance before first withdrawal
    let balanceBefore = await token.balanceOf(deployer.address);
    console.log(`${deployer.address} Beneficiary ERC20 token balance before withdrawal:`, balanceBefore.toString());

    let verificationFee = await bridge.verificationFee();
    // Make  withdraw for beneficiary1
    let withdrawAmount = depositAmount;
    const signatures = eventProof.signatures;
    let v = [], r = [], s = []; // signature params
    signatures.forEach(signature => {
        const hexifySignature = ethers.utils.hexlify(signature);
        const sig = ethers.utils.splitSignature(hexifySignature);
        v.push(sig.v);
        r.push(sig.r);
        s.push(sig.s);
    });

    console.log(await peg.withdraw(token.address, withdrawAmount, deployer.address, {eventId: eventProof.eventId, validatorSetId: eventProof.validatorSetId,
            v,
            r,
            s
        },
        {
            gasLimit: 500000,
            value: verificationFee
        }
    ));

    // Check beneficiary balance after first withdrawal
    let balanceAfter = await token.balanceOf(deployer.address);
    console.log('Beneficiary ERC20 token balance after withdrawal:', balanceAfter.toString());

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
