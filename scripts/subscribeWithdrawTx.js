const BigNumber = require('bignumber.js')
const { Api } = require('@cennznet/api');
require("dotenv").config();
const logger = require('./logger');
const mongoose = require('mongoose');
const { EventProof, WithdrawProof  } = require('../src/mongo/models');
const { u8aToString } = require('@polkadot/util');
const ethers = require('ethers');
const bridgeAbi = require("../abi/CENNZnetBridge.json").abi;
const pegAbi = require("../abi/ERC20Peg.json").abi;

let registeredAsset;
const timeoutMs = 20000;
// Ignore if validator public key is 0x000..
const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';

// Get the notary key from CENNZnet and convert it to public key to be used to set validator on bridge contract
async function  extractValidators(api, blockHash) {
    const notaryKeys = await api.query.ethBridge.notaryKeys.at(blockHash);
    const newValidators = notaryKeys.map((notaryKey) => {
        if (notaryKey.toString() === IGNORE_KEY) return '0x0000000000000000000000000000000000000000';
        let decompressedPk = ethers.utils.computePublicKey(notaryKey);
        let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
        return '0x' + h.slice(26)
    });
    return newValidators;
}

function bnShift(number, shift) {
    shift = parseInt(shift)
    return new BigNumber(number).shiftedBy(shift).toNumber();
}

// taken from uncover front end to show the right value of balance considering decimal places
function accuracyFormat(num, accuracy) {
    if (accuracy) {
        return scientificToDecimal(bnShift(num, -accuracy).toString());
    } else if (+accuracy === 0){
        return num;
    } else {
        return '';
    }
}

function scientificToDecimal(number) {
    let numberHasSign = number.startsWith("-") || number.startsWith("+");
    let sign = numberHasSign ? number[0] : "";
    number = numberHasSign ? number.replace(sign, "") : number;

    //if the number is in scientific notation remove it
    if (/\d+\.?\d*e[\\+\\-]*\d+/i.test(number)) {
        let zero = '0';
        let parts = String(number).toLowerCase().split('e'); //split into coeff and exponent
        let e = parts.pop();//store the exponential part
        let l = Math.abs(e); //get the number of zeros
        let sign = e / l;
        let coeff_array = parts[0].split('.');

        if (sign === -1) {
            coeff_array[0] = Math.abs(coeff_array[0]);
            number = zero + '.' + new Array(l).join(zero) + coeff_array.join('');
        } else {
            let dec = coeff_array[1];
            if (dec) l = l - dec.length;
            number = coeff_array.join('') + new Array(l + 1).join(zero);
        }
    }

    return `${sign}${number}`;
}

async function getWithdrawProofAndUpdateDB(api, eventDetails, blockHash, bridge) {
    try {
        const [eventId, assetId, amountRaw, beneficiary] = eventDetails;
        let amount = api.registry.createType('Balance', amountRaw).toString();
        const eventProof = await withTimeout(api.derive.ethBridge.eventProof(eventId), timeoutMs);
        const newValidators = await extractValidators(api, blockHash);
        logger.info(`IMP WITHDRAW Parameters :::`);
        logger.info(`IMP WITHDRAW newValidators:${newValidators}`);
        logger.info(`IMP WITHDRAW event proof::${JSON.stringify(eventProof)}`);
        const rawBlock = await api.rpc.chain.getBlock(blockHash);
        const block = rawBlock.toHuman();
        const withdrawExtIndex
            = block.block.extrinsics.findIndex(ex => ex.isSigned === true && ex.method.method === 'withdraw' && ex.method.section === 'erc20Peg');
        const withdrawExt = block.block.extrinsics[withdrawExtIndex];
        const rawExt = rawBlock.block.extrinsics[withdrawExtIndex];
        const txHash = api.registry.createType('Extrinsic', rawExt).hash.toHex();
        const cennznetAddress = withdrawExt ? withdrawExt.signer : '';
        console.log('withdrawExt::',withdrawExt);

        const proof = {
            eventId: eventProof.eventId,
            validatorSetId: eventProof.validatorSetId,
            r: eventProof.r,
            s: eventProof.s,
            v: eventProof.v,
            validators: newValidators
        };

        //Check how long until the proof expires
        const currentProofTTLEras = await bridge.proofTTL();
        console.info("currentProofTTLEras:", currentProofTTLEras)
        const cennznetEraTimeSeconds = 86400;
        const cennnznetBlockTimeSec = 5;
        let remainingSecsTillExpires = currentProofTTLEras * cennznetEraTimeSeconds;
        //check how much time passed in current cennznet epoch
        const sessionProgress = await api.derive.session.progress();
        const blocksElapsedInCurrentEra = sessionProgress.eraProgress.toNumber();
        const secElapsedInCurrentEra = blocksElapsedInCurrentEra * cennnznetBlockTimeSec;
        remainingSecsTillExpires = remainingSecsTillExpires - secElapsedInCurrentEra;
        const currentEpochTime = parseInt(new Date() / 1000);
        const expiresAtEpochTime = currentEpochTime + remainingSecsTillExpires;
        await updateWithdrawalProofInDB(cennznetAddress, proof, assetId, amount, beneficiary, txHash, expiresAtEpochTime);
    } catch (e) {
        logger.error(`IMP WITHDRAW err ${e.stack} `);
    }
}

async function updateWithdrawalProofInDB(cennznetAddress, proof, assetId, amount, beneficiary, txHash, expiresAt) {
    try {
        const asset = registeredAsset.find(([assetId1]) => assetId1.toString() === assetId);
        let symbol = '';
        try {
            symbol = asset ? u8aToString(asset[1].symbol) : '';
        } catch (e) {
            console.log('symbol is incorrect:', asset[1].symbol);
        }
        const exactAmount = `${accuracyFormat(amount, typeof asset === 'undefined'? 0 : asset[1].decimalPlaces )} ${symbol}`;
        logger.info(`saving withdrawal data ${JSON.stringify(proof)} for address ${cennznetAddress} in db`);
        const filter = { _id: cennznetAddress};
        const withdrawal = { proofId: proof.eventId, amount: exactAmount, assetId: assetId, beneficiary: beneficiary, txHash: txHash,  hasClaimed: false, expiresAt:expiresAt};
        const update = { $push: { withdrawals: withdrawal }};
        const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // create new if record does not exist, else update
        await WithdrawProof.updateOne(filter, update, options);
        const eventProof = new EventProof({
            _id: proof.eventId,
            validatorSetId: proof.validatorSetId, r: proof.r, s: proof.s, v: proof.v,
            validators: proof.validators
        });
        await eventProof.save();
    } catch (e) {
        logger.error(`saving withdrawal data ${JSON.stringify(proof)} for address ${cennznetAddress} in db failed:: ${e}`);
    }
}

async function main (networkName, bridgeContractAddress, pegContractAddress) {
    networkName = networkName || 'local';

    const connectionStr = process.env.MONGO_URI;
    await mongoose.connect(connectionStr);

    const provider = process.env.WS_PROVIDER;
    logger.info('Provider::', provider);
    const api = provider ? await Api.create({provider}): await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);

    const wsProvider = new ethers.providers.AlchemyProvider(process.env.ETH_NETWORK,
            process.env.AlCHEMY_API_KEY
        );

    const pegContract = new ethers.Contract(pegContractAddress, pegAbi, wsProvider);
    const pegInterface = new ethers.utils.Interface(pegAbi);

    registeredAsset = await api.rpc.genericAsset.registeredAssets();
    registeredAsset = registeredAsset.toJSON();

    let wallet = new ethers.Wallet(process.env.ETH_ACCOUNT_KEY, wsProvider);

    const bridge = new ethers.Contract(bridgeContractAddress, bridgeAbi, wallet);
    logger.info('Connecting to CENNZnet bridge contract...');
    logger.info(`CENNZnet bridge deployed to: ${bridge.address}`);

    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
            const blockNumber = head.number.toNumber();
            logger.info(`At blocknumber: ${blockNumber}`);

            const blockHash = head.hash.toString();
            const events = await api.query.system.events.at(blockHash);
            events.map(async ({event}) => {
                const { section, method, data } = event;
                if  (section === 'erc20Peg' && method == 'Erc20Withdraw') {
                    await getWithdrawProofAndUpdateDB(api, data.toJSON(), blockHash, bridge);
                }
            })
        });

    //listen to withdraw events on eth to update claimed proofs
    pegContract.on("Withdraw", async (from, to, value, event) => {
        //get the proofId/eventId in transaction hash
        const tx = await wsProvider.getTransaction(event.transactionHash);
        const decodedTx = pegInterface.parseTransaction({ data: tx.data, value: tx.value});
        const eventId = parseInt(decodedTx.args[3].eventId.toString());
        //confirm withdraw on contract
        const hasClaimed = await bridge.eventIds(eventId);
        const withdrawalProof = await WithdrawProof.findOne().elemMatch("withdrawals",{ "proofId": eventId });
        //get correct proof in array and update
        withdrawalProof.withdrawals = withdrawalProof.withdrawals.map(withdrawal => {
            if (withdrawal.proofId === eventId.toString()) {
                withdrawal.hasClaimed = hasClaimed;
                return withdrawal;
            }
            else{
                return withdrawal;
            }
        });
        await withdrawalProof.save();
    });
}

async function withTimeout(promise, timeoutMs) {
    return Promise.race ([
        promise,
        new Promise  ((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, timeoutMs);
        }),
    ]);
}

const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
const pegContractAddress = process.env.PEG_CONTRACT;
main(networkName, bridgeContractAddress, pegContractAddress).catch((err) => console.log(err));

