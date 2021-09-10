require('@nomiclabs/hardhat-ethers');

const ALCHEMY_API_KEY = process.env.apiKey;

const ROPSTEN_PRIVATE_KEY = process.env.accountKey;

module.exports = {
  solidity: {
    version: "0.8.4",
      settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [`0x${ROPSTEN_PRIVATE_KEY}`],
    },
  },
}
