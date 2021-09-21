
const { Api } = require('@cennznet/api');
require("dotenv").config();
const logger = require('./logger');
const nodemailer = require('nodemailer');

// Send email when accounts eth balance is less than gas fees
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.supportEmail,
        pass: process.env.pass
    }
});

const mailOptions = {
    from: process.env.supportEmail,
    to: process.env.supportEmail,
    subject: 'Please top up eth balance',
    text: 'To keep the validator relayer running, topup the eth account'
};

// Ignore if validator public key is 0x000..
const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';
// Ignore if signature is 0x000
const IGNORE_SIGNATURE = '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

async function getEventPoofAndSubmit(api, eventId, bridge, txExecutor) {
    let eventProof = null;
    await new Promise(async (resolve, reject) => {
        try {
            await api.rpc.ethy.getEventProof(eventId, async (versionedEventProof) => {
                logger.debug(`versionedEventProof:: ${versionedEventProof.toJSON()}`);
                eventProof = versionedEventProof ? versionedEventProof.toJSON().EventProof : null;
                logger.info('Event proof found::', eventProof);
                if (eventProof) {
                    const {eventId, validatorSetId, signatures} = eventProof;
                    let v = [], r = [], s = []; // signature params
                    signatures.filter(sig => sig.toString() !== IGNORE_SIGNATURE).forEach(signature => {
                        const hexifySignature = ethers.utils.hexlify(signature);
                        const sig = ethers.utils.splitSignature(hexifySignature);
                        v.push(sig.v);
                        r.push(sig.r);
                        s.push(sig.s);
                    });
                    const cennznetEventProof =
                        {
                            eventId,
                            validatorSetId,
                            v,
                            r,
                            s
                        };
                    const notaryKeys = await api.query.ethBridge.notaryKeys();
                    const filteredNotaryKeys = notaryKeys.filter(notaryKey => notaryKey.toString() !== IGNORE_KEY);
                    const newValidators = filteredNotaryKeys.map((notaryKey) => {
                        logger.debug('notary key:',notaryKey.toString());
                        let decompressedPk = ethers.utils.computePublicKey(notaryKey);
                        let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
                        return '0x' + h.slice(26)
                    });
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
                        transporter.sendMail(mailOptions, function (error, info) {
                            if (error) {
                                console.log(error);
                            } else {
                                console.log('Email sent: ' + info.response);
                            }
                        });
                    }
                    resolve();
                }
            });
        } catch (e) {
            logger.error(e);
        }
    })

}

async function main (networkName, bridgeContractAddress) {
    networkName = networkName || 'local';
    // the API has connected to the node and completed the initialisation process

    const api = await Api.create({network: networkName, types: {PalletId: 'LockIdentifier'}});
    const [txExecutor] = await ethers.getSigners();
    // Get the bridge instance that was deployed
    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    logger.info('Connecting to CENNZnet bridge contract...');
    const bridge = await Bridge.attach(bridgeContractAddress);
    await bridge.deployed();
    logger.info(`CENNZnet bridge deployed to: ${bridge.address}`);
    logger.info(`Executor: ${txExecutor.address}`);

    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
           const blockNumber = head.number.toNumber();
           logger.info(`At blocknumber: ${blockNumber}`);
           const blockHash = head.hash.toString();
           const events = await api.query.system.events.at(blockHash);
           events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'AuthoritySetChange') {
                    const eventIdFound = data.toHuman()[0];
                    await getEventPoofAndSubmit(api, eventIdFound, bridge, txExecutor);
                }
            })
        });
}

// const networkNames = ['azalea', 'nikau', 'rata', 'local'];
const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
main(networkName, bridgeContractAddress).catch((err) => logger.error(err));
