const {writeFileSync} = require("fs");

const { Api } = require('@cennznet/api');
const { assert, compactAddLength, isHex, hexToU8a, u8aToHex} = require('@cennznet/util')
const http = require('https');
const { Keyring } = require('@polkadot/keyring');


function createParam(hex, length = -1) {
    let u8a;

    try {
        u8a = hexToU8a(hex.toString());
    } catch (error) {
        u8a = new Uint8Array([]);
    }

    const isValid = length !== -1 ? u8a.length === length : u8a.length !== 0;

    return {
        isValid,
        u8a: compactAddLength(u8a),
    };
}

function parseRawJSON(json) {
    const keys = Object.keys(json);
    let isValid = keys.length !== 0;
    const value = keys.map((key) => {
        const value = json[key];

        assert(isHex(key) && isHex(value), `Non-hex key/value pair found in ${key.toString()} => ${value.toString()}`);

        const encKey = createParam(key);
        const encValue = createParam(value);

        isValid = isValid && encKey.isValid && encValue.isValid;

        return [encKey.u8a, encValue.u8a];
    });

    return {
        isValid,
        value,
    };
}

// Verify if the meta data set is accurate
async function verifyMeta(api, listOfTokens) {
    let successfulAddress = new Set();
    let unsuccessfulAddress = new Set();
    await Promise.all(
        listOfTokens.map(async ({address, symbol, decimals}, idx) => {
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
            let storageMap = {};
            // Push Centrality tokens
            listOfTokens.push({address: '0xd4fffa07929b1901fdb30c1c67f80e1185d4210f', symbol: 'CERTI', decimals: 18});
            listOfTokens.push({address: '0xf293d23bf2cdc05411ca0eddd588eb1977e8dcd4', symbol: 'SYLO', decimals: 18});
            listOfTokens.push({address: '0x1122b6a0e00dce0563082b6e2953f3a943855c1f', symbol: 'CENNZ', decimals: 4});
            listOfTokens.push({address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18});
            await Promise.all(
                listOfTokens.map(async ({address, symbol, decimals}) => {
                    const storageTuple =  api.registry.createType('(Vec<u8>, u8)', [symbol, decimals]);
                    const u8aTuple = storageTuple.toU8a();
                    const hexTuple = u8aToHex(u8aTuple);
                    const erc20MetaKey = await api.query.erc20Peg.erc20Meta.key(address);
                    storageMap[erc20MetaKey] = hexTuple;

                })
            );
            console.log('storageMap::',storageMap);
            writeFileSync('RawStorage.json', JSON.stringify(storageMap));
            const {isValid, value} = parseRawJSON(storageMap);
            if (isValid === false) {
                console.log('Expect the values for setting the storage is in correct format');
                process.exit(1);
            }
            const tx = api.tx.system.setStorage(value);
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
