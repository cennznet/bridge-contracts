
const { Api } = require('@cennznet/api');

async function getEventPoofAndSubmit(api, eventId, bridge, txExecutor) {
    let eventProof = null;
    while (eventProof === null) {
        console.log('Inside while with eventId is ',eventId);
        await api.rpc.ethy.getEventProof(eventId, async (versionedEventProof) => {
            console.log('versionedEventProof::', versionedEventProof.toJSON());
            eventProof = versionedEventProof ? versionedEventProof.toJSON().EventProof : null;
            console.log('Event proof found::', eventProof);
            const {eventId, validatorSetId, signatures} = eventProof;
            let v = [], r = [], s = []; // signature params
            signatures.forEach(signature => {
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
            const newValidators = notaryKeys.map((notaryKey) => {
                let decompressedPk = ethers.utils.computePublicKey(notaryKey);
                let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
                return '0x' + h.slice(26)
            });
            console.log("Sending setValidators tx with the account:", txExecutor.address);
            console.log(await bridge.setValidators(newValidators, cennznetEventProof));
        });
    }

}

async function main (networkName, bridgeContractAddress) {
    networkName = networkName || 'local';
    // the API has connected to the node and completed the initialisation process

    const api = await Api.create({network: networkName});
    const [txExecutor] = await ethers.getSigners();

    // Get the bridge instance that was deployed
    const Bridge = await ethers.getContractFactory('CENNZnetBridge');
    console.log('Connecting to CENNZnet bridge contract...');
    bridgeContractAddress = bridgeContractAddress || "0x75a2488b80D1a12cB0209cB1C40986863745Ee2f";
    const bridge = await Bridge.attach(bridgeContractAddress);
    await bridge.deployed();
    console.log('CENNZnet bridge deployed to:', bridge.address);

    const eventIds = []; // store all the event ids for which we need to set validators and event proof
    await api.rpc.chain
        .subscribeFinalizedHeads(async (head) => {
           const blockNumber = head.number.toNumber();
           console.log('At blocknumber:',blockNumber);
           const blockHash = head.hash.toString();
           const events = await api.query.system.events.at(blockHash);
           events.map(async ({event}) => {
                const { section, method, data } = event;
                if (section === 'ethBridge' && method === 'AuthoritySetChange') {
                    const eventIdFound = data.toHuman()[0];
                    eventIds.push(eventIdFound);
                    await getEventPoofAndSubmit(api, eventIdFound, bridge, txExecutor);
                }
            })
        });
}

// const networkNames = ['azalea', 'nikau', 'rata', 'local'];
const networkName = 'local';
const bridgeContractAddress = '0x75a2488b80D1a12cB0209cB1C40986863745Ee2f';
main(networkName, bridgeContractAddress).catch(console.error);
