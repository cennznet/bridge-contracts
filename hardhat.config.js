require('@nomiclabs/hardhat-ethers');
require("dotenv").config();

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
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ROPSTEN_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ACCOUNT_KEY}`],
    },
    mainnet: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.MAINNET_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ACCOUNT_KEY}`],
    }
  },
}
