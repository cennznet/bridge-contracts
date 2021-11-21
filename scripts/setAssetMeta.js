const { Api } = require('@cennznet/api');
const http = require('https');
const { Keyring } = require('@polkadot/keyring');
const dotenv = require('dotenv');
dotenv.config();

const MAINNET_CHAIN_ID = 1;
const ROPSTEN_CHAIN_ID = 3;
const KOVAN_CHAIN_ID = 42;

// Verify if the meta data set is accurate
async function verifyMeta(api, listOfTokens) {
    let successfulAddress = new Set();
    let unsuccessfulAddress = new Set();
    await Promise.all(
        listOfTokens.map(async ({address, symbol, decimals, chainId}) => {
            if (
                (process.env.NETWORK === 'local' && chainId === ROPSTEN_CHAIN_ID) ||
                (process.env.NETWORK === 'rata' && chainId === ROPSTEN_CHAIN_ID) ||
                (process.env.NETWORK === 'nikau' && chainId === KOVAN_CHAIN_ID) ||
                (process.env.NETWORK === 'azalea' && chainId === MAINNET_CHAIN_ID)
            ) {
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
    console.log('process.env.NETWORK:::',process.env.NETWORK);
    const api = await Api.create(
        {
            network: process.env.NETWORK,
        });
    const keyring = new Keyring({type: 'sr25519'});
    const alice = keyring.addFromUri(process.env.CENNZNET_SECRET);
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
        // TODO: before running change the chainId: either ropsten, kovan or mainnet
        listOfTokens.push({address: '0xd4fffa07929b1901fdb30c1c67f80e1185d4210f', symbol: 'CERTI', decimals: 18, chainId: MAINNET_CHAIN_ID});
        listOfTokens.push({address: '0xf293d23bf2cdc05411ca0eddd588eb1977e8dcd4', symbol: 'SYLO', decimals: 18, chainId: MAINNET_CHAIN_ID});
        listOfTokens.push({address: '0x1122b6a0e00dce0563082b6e2953f3a943855c1f', symbol: 'CENNZ', decimals: 4, chainId: MAINNET_CHAIN_ID});
        listOfTokens.push({address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18, chainId: MAINNET_CHAIN_ID});
        listOfTokens.map(({address, symbol, decimals, chainId}) => {

            if (
                (process.env.NETWORK === 'local' && chainId === ROPSTEN_CHAIN_ID) ||
                (process.env.NETWORK === 'rata' && chainId === ROPSTEN_CHAIN_ID) ||
                (process.env.NETWORK === 'nikau' && chainId === KOVAN_CHAIN_ID) ||
                (process.env.NETWORK === 'azalea' && chainId === MAINNET_CHAIN_ID)
            ) {
                const recTuple = api.registry.createType('(EthAddress, Vec<u8>, u8)', [address, symbol, decimals]);
                details.push(recTuple);
            }
        });
        const vecTuple = api.registry.createType('Details', details);
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
