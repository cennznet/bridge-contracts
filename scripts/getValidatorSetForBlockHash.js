// Ignore if validator public key is 0x000..
const {ethers} = require("hardhat");
const {Api} = require("@cennznet/api");
const IGNORE_KEY = '0x000000000000000000000000000000000000000000000000000000000000000000';
function extractValidators(notaryKeys) {
    const newValidators = notaryKeys.map((notaryKey) => {
        if (notaryKey.toString() === IGNORE_KEY) return '0x0000000000000000000000000000000000000000';
        let decompressedPk = ethers.utils.computePublicKey(notaryKey);
        let h = ethers.utils.keccak256('0x' + decompressedPk.slice(4));
        return '0x' + h.slice(26)
    });
    return newValidators;
}


// Get the current notary key from CENNZnet and convert it to public key to be used to set validator on bridge contract
async function  extractCurrentValidators(api, blockHash) {
    const notaryKeys = await api.query.ethBridge.notaryKeys.at(blockHash);
    const newValidators = extractValidators(notaryKeys);
    return newValidators;
}

async function main() {
    const api = await Api.create({provider: process.env.WS_PROVIDER});
    const blockHash = '0x1161cd48824867f4d376512ad737a080bf871c4ac8b52bf43cb65ba3bee9d3e7';
    const currentValidators = await extractCurrentValidators(api, blockHash);
    console.log('validator for given blockHash :', currentValidators);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
