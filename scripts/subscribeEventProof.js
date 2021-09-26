
const { Api } = require('@cennznet/api');
require("dotenv").config();
const logger = require('./logger');
const { curly } = require("node-libcurl");
let txExecutor;

// Ignore if validator public key is 0x000..
const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';

async function getEventPoofAndSubmit(api, eventId, bridge, txExecutor, lastValidatorsSet) {
    let eventProof = null;
    return new Promise(async (resolve, reject) => {
        try {
            await api.rpc.ethy.getEventProof(eventId, async (versionedEventProof) => {
                logger.debug(`versionedEventProof:: ${versionedEventProof.toJSON()}`);
                eventProof = versionedEventProof ? versionedEventProof.toJSON().EventProof : null;
                const notaryKeys = await api.query.ethBridge.notaryKeys();
                const filteredNotaryKeys = notaryKeys.filter(notaryKey => notaryKey.toString() !== IGNORE_KEY);
                const newValidators = filteredNotaryKeys.map((notaryKey) => {
                    let decompressedPk = ethers.utils.computePublicKey(notaryKey);
                    let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
                    return '0x' + h.slice(26)
                });
                if (eventProof) {
                    // Check if proof is already submitted
                    if ( lastValidatorsSet && lastValidatorsSet.id === eventProof.validatorSetId.toString() &&
                        JSON.stringify(newValidators) === JSON.stringify(lastValidatorsSet.validators) ){
                        logger.info(`Proof is already submitted..${eventProof}`);
                        return resolve();
                    }
                    const {eventId, validatorSetId, signatures} = eventProof;
                    let v = [], r = [], s = []; // signature params
                    signatures.forEach(signature => {
                        const hexifySignature = ethers.utils.hexlify(signature);
                        const sig = ethers.utils.splitSignature(hexifySignature);
                        v.push(sig.v);
                        r.push(sig.r);
                        s.push(sig.s);
                    });
                    const cennznetEventProof = {
                        eventId,
                        validatorSetId,
                        v,
                        r,
                        s
                    };

                    logger.info("Sending setValidators tx with the account:", txExecutor.address);
                    const gasEstimated = await bridge.estimateGas.setValidators(newValidators, cennznetEventProof, {gasLimit: 500000});
                    logger.info(await bridge.setValidators(newValidators, cennznetEventProof, {gasLimit: 500000}));
                    const balance = await ethers.provider.getBalance(txExecutor.address);
                    logger.info(`Balance is: ${balance}`);
                    const gasPrice = await ethers.provider.getGasPrice();
                    logger.info(`Gas price: ${gasPrice.toString()}`);
                    const gasRequired = gasEstimated.mul(gasPrice);
                    logger.info(`Gas required: ${gasRequired.toString()}`);
                    if (balance.lt(gasRequired.mul(2))) {
                        const { statusCode, data } = await curly.post(`https://hooks.slack.com/services/${process.env.SECRET}`, {
                            postFields: JSON.stringify({
                                "text": ` 🚨 To keep the validator relayer running, topup the eth account ${txExecutor.address} on CENNZnets ${process.env.NETWORK} chain`
                            }),
                            httpHeader: [
                                'Content-Type: application/json',
                                'Accept: application/json'
                            ],
                        });
                        logger.info(`Slack notification sent ${data} and status code ${statusCode}`);
                    }
                    return resolve();
                }
            });
        } catch (e) {
            logger.error(e);
            return reject(e);
        }
    })
}

function getValidatorAddedToBridge(bridge) {
    let lastValidatorsSet = {};

    const filter = {
        address: bridge.address,
        fromBlock: 0,
        topics: [
            ethers.utils.id("SetValidators(address[],uint256,uint32)")
        ]
    }

    ethers.provider.getLogs(filter).then((result) => {
        if (result.length > 0) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const decodedResponse = abiCoder.decode(['address[]', 'uint256', 'uint32'], result[result.length - 1].data);
            lastValidatorsSet.validators = decodedResponse[0].map(validator => validator.toLowerCase());
            lastValidatorsSet.id = decodedResponse[2].toString();
            logger.info(`Previous Validator set in bridge is: ${JSON.stringify(lastValidatorsSet)}`);
        }
    });
    return lastValidatorsSet;
}


async function main (networkName, bridgeContractAddress) {
    networkName = networkName || 'local';

    const api = await Api.create({network: networkName});
    logger.info(`Connect to cennznet network ${networkName}`);
    [txExecutor] = await ethers.getSigners();

    // Get the bridge instance that was deployed
    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    logger.info('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach(bridgeContractAddress);
    await bridge.deployed();
    logger.info(`CENNZnet bridge deployed to: ${bridge.address}`);
    logger.info(`Executor: ${txExecutor.address}`);

    let lastValidatorsSet = getValidatorAddedToBridge(bridge);

    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
           const blockNumber = head.number.toNumber();
           logger.info(`timeStampInMs: ${Date.now()}`);
           logger.info(`At blocknumber: ${blockNumber}`);

           const blockHash = head.hash.toString();
           const events = await api.query.system.events.at(blockHash);
           events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'AuthoritySetChange') {
                    const eventIdFound = data.toHuman()[0];
                    await getEventPoofAndSubmit(api, eventIdFound, bridge, txExecutor, lastValidatorsSet);
                }
            })
        });
}

const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
main(networkName, bridgeContractAddress).catch((err) => console.log(err));
