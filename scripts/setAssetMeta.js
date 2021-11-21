const { Api } = require('@cennznet/api');
const http = require('https');
const { Keyring } = require('@polkadot/keyring');

// Verify if the meta data set is accurate
async function verifyMeta(api, listOfTokens) {
    let successfulAddress = new Set();
    let unsuccessfulAddress = new Set();
    await Promise.all(
        listOfTokens.map(async ({address, symbol, decimals}) => {
            const metaForAddress = await api.query.erc20Peg.erc20Meta(address);
            const [symbolApi, decimalApi] = metaForAddress.toHuman();
            if (symbol.toString() === symbolApi.toString() && decimals.toString() === decimalApi.toString()) {
                console.log('Successfully verified for address ', address);
                successfulAddress.add(address);
            } else {
                console.log('UNsuccessful for address', address);
                console.log(`Expected symbol ${symbol} and decimals ${decimals}`);
                console.log(`Got symbol ${symbolApi} and decimals ${decimalApi}`);
                unsuccessfulAddress.add(address)
            }
        })
    );
    console.log('Successfully updated meta for', successfulAddress);
    console.log('UnSuccessfully updated meta for', unsuccessfulAddress);
    process.exit(0);
}

// Pull uniswap tokens detail and push them to cennznet
async function main() {
    const url = 'https://gateway.ipfs.io/ipns/tokens.uniswap.org'; // download all tokens form uniswap
<<<<<<< Updated upstream
=======
    console.log('process.env.NETWORK:::', process.env.NETWORK);
>>>>>>> Stashed changes
    const api = await Api.create(
        {
            network: 'local',
            types: {
                details: 'Vec<(EthAddress, Vec<u8>, u8 )>',
                meta: '(EthAddress, Vec<u8>, u8)'
            }
        });
    const keyring = new Keyring({type: 'sr25519'});
    const alice = keyring.addFromUri('//Alice');
    http.get(url, (res) => {
    let dataQueue = "";
    res.on('data', (d) => {
        dataQueue += d;
    });
    res.on("end", async function () {
        const content = JSON.parse(dataQueue);
        let listOfTokens = content['tokens'];
        let details = [];
        // Push Centrality tokens
        listOfTokens.push({address: '0xd4fffa07929b1901fdb30c1c67f80e1185d4210f', symbol: 'CERTI', decimals: 18});
        listOfTokens.push({address: '0xf293d23bf2cdc05411ca0eddd588eb1977e8dcd4', symbol: 'SYLO', decimals: 18});
        listOfTokens.push({address: '0x1122b6a0e00dce0563082b6e2953f3a943855c1f', symbol: 'CENNZ', decimals: 4});
        listOfTokens.push({address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18});
        listOfTokens.map(({address, symbol, decimals}) => {
            const recTuple = api.registry.createType('(EthAddress, Vec<u8>, u8)', [address, symbol, decimals]);
            details.push(recTuple);
        });
        const vecTuple = api.registry.createType('details', details);
        const tx = api.tx.erc20Peg.setErc20Meta(vecTuple);
        await api.tx.sudo.sudo(tx).signAndSend(alice, async ({status, events}) => {
            if (status.isInBlock) {
                events.forEach(({phase, event: {data, method, section}}) => {
                    console.log('\t', phase.toString(), `: ${section}.${method}`, data.toString());
                    verifyMeta(api, listOfTokens);
                });
            }
        });
    });

}).on('error', (e) => {
    console.error(e);
});

}

main().catch(console.error);
