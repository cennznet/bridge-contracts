
const { Api } = require('@cennznet/api');
const { Keyring } = require('@polkadot/keyring');
const { ethers } = require("hardhat");

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

    // Activate deposits
    console.log(await peg.activateDeposits());
    // Activate withdrawals
    console.log(await peg.activateWithdrawals());

    /***************** Ethereum Setup ends here **********************/

    /***************** Make Deposit on ETHEREUM **********************/

    const ethBalanceBefore = await ethers.provider.getBalance(peg.address);
    console.log('Balance before::', ethBalanceBefore.toString());
    const ethAddress = '0x0000000000000000000000000000000000000000';
    let depositAmount = 5644;
    // Alice
    let cennznetAddress = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
    const deposition = await peg.deposit(ethAddress, depositAmount, cennznetAddress, {
        gasLimit: 500000,
        value: depositAmount
    });
    const depositTxHash = deposition.hash;
    console.log('depositTxHash:::',depositTxHash);

    const ethBalanceAfter = await ethers.provider.getBalance(peg.address);
    console.log('Balance after::', ethBalanceAfter.toString());



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

    await new Promise( (resolve) => {
        api.tx.sudo.sudo(batchBridgeActivationEx).signAndSend(alice, async ({status, events}) => {
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
    const tokenExist = await api.query.erc20Peg.erc20ToAssetId(ethAddress);
    const testTokenId = tokenExist.isSome ? tokenExist.unwrap() : await api.query.genericAsset.nextAssetId();
    const claim = {
        tokenAddress: ethAddress,
        amount: depositAmount,
        beneficiary: cennznetAddress
    };

    console.log('testTokenId::', testTokenId.toString());

    /***************** Make Deposit on CENNZnet **********************/
    let eventClaimId;
    await new Promise( (resolve) => {
        api.tx.erc20Peg.depositClaim(depositTxHash, claim).signAndSend(alice, async ({status, events}) => {
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
    // eslint-disable-next-line no-async-promise-executor
    await new Promise(async (resolve, reject) => {
        const unsubHeads = await api.rpc.chain.subscribeNewHeads(() => {
            console.log('Waiting till Ethbridge sends a verify event...');
            console.log('Also look for Erc20deposit event to check if deposit claim succeeded')
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
                    } else if (event.section === 'erc20Peg' && event.method === 'Erc20Failed') {
                        const [claimId] = event.data;
                        if (claimId.toString() === eventClaimId.toString()) {
                            console.error(`Deposit claim failed: ${eventClaimId.toString()}`);
                            reject('Deposit claim failed');
                        }
                    } else if (event.section === 'ethBridge' && event.method === 'Verified') {
                        unsubHeads();
                        resolve();
                    }
                });
            });
        });
    });
    await new Promise( (resolve) => {
        let amount = depositAmount;
        const ethBeneficiary = deployer.address;
        api.tx.erc20Peg.withdraw(testTokenId, amount, ethBeneficiary).signAndSend(alice, async ({status, events}) => {
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
    // eslint-disable-next-line no-async-promise-executor
    await new Promise(async (resolve) => {
        const unsubHeads = await api.rpc.chain.subscribeNewHeads(async () => {
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

    // Ignore if validator public key is 0x000..
    const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';

    // Set validators for bridge
    console.log('Set validators for bridge...');
    const notaryKeys = await api.query.ethBridge.notaryKeys();
    const newValidators = notaryKeys.map((notaryKey) => {
        console.log('notary key:',notaryKey.toString());
        if (notaryKey.toString() === IGNORE_KEY) return notaryKey.toString()
        let decompressedPk = ethers.utils.computePublicKey(notaryKey);
        let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
        return '0x' + h.slice(26)
    });
    console.log('newValidators::',newValidators);
    const eventProof_Id = await api.query.ethBridge.notarySetProofId();
    console.log('event proof id::', eventProof_Id.toString());
    const event_Proof = await api.derive.ethBridge.eventProof(eventProof_Id);
    console.log('Event proof::', event_Proof);
    console.log(await bridge.forceActiveValidatorSet(newValidators, event_Proof.validatorSetId  , {gasLimit: 500000}));


    /***************** Make Withdrawal on ETHEREUM **********************/

        // Check beneficiary balance before first withdrawal
    let balanceBefore = await ethers.provider.getBalance(deployer.address);
    console.log(`Beneficiary Eth balance before withdrawal:`, balanceBefore.toString());

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

    console.log(await peg.withdraw(ethAddress, withdrawAmount, deployer.address, {eventId: eventProof.eventId, validatorSetId: eventProof.validatorSetId,
            v,
            r,
            s,
            validators: newValidators,
        },
        {
            gasLimit: 500000,
            value: verificationFee
        }
    ));

    // Check beneficiary balance after first withdrawal
    const balanceAfter = await ethers.provider.getBalance(deployer.address);
    console.log('Beneficiary eth balance after withdrawal:', balanceAfter.toString());
    const pegBalanceAfter = await ethers.provider.getBalance(peg.address);
    console.log('Contract eth balance after withdrawal:', pegBalanceAfter.toString());

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
