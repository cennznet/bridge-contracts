const { ethers } = require("hardhat");
const { Api } = require('@cennznet/api');
const logger = require('./logger');

const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';
const BUFFER = 1000;

async function main (networkName, bridgeContractAddress) {
    try {
        const api = await Api.create({network: networkName});
        logger.info(`Connect to cennznet network ${networkName}`);

        // Get the bridge instance that was deployed
        const Bridge = await ethers.getContractFactory('CENNZnetBridge');
        logger.info('Connecting to CENNZnet bridge contract...');
        const bridge = await Bridge.attach(bridgeContractAddress);
        await bridge.deployed();
        logger.info(`CENNZnet bridge deployed to: ${bridge.address}`);

        let [txExecutor] = await ethers.getSigners();
        logger.info('Set validators for bridge...');
        const notaryKeys = await api.query.ethBridge.notaryKeys();
        const newValidators = notaryKeys.map((notaryKey) => {
            logger.info('notary key:', notaryKey.toString());
            if (notaryKey.toString() === IGNORE_KEY) return '0x0000000000000000000000000000000000000000';
            let decompressedPk = ethers.utils.computePublicKey(notaryKey);
            let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
            return '0x' + h.slice(26)
        });
        //get the latest validator set id
        let validatorSetId = await api.query.ethBridge.notarySetId();
        validatorSetId = parseInt(validatorSetId.toString());
        logger.info(`Latest Validator set Id:: ${validatorSetId}`);
        logger.info(`First time set newValidators:: ${newValidators}`);
        logger.info(`Executor: ${txExecutor.address}`);
        const gasEstimated = await bridge.estimateGas.forceActiveValidatorSet(newValidators, validatorSetId, {gasLimit: 5000000});
        logger.info(`Gas estimate ${gasEstimated}`);
        logger.info(JSON.stringify(await bridge.forceActiveValidatorSet(newValidators, validatorSetId, {gasLimit: gasEstimated.add(BUFFER)})));
        process.exit(0)
    } catch (e) {
        logger.error(e);
        process.abort();
    }
}

const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;

main(networkName, bridgeContractAddress).catch((err) => console.log(err));
