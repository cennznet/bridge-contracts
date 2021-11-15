require('@nomiclabs/hardhat-ethers');
require("@nomiclabs/hardhat-etherscan");
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
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.RINKEBY_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ETH_ACCOUNT_KEY}`],
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ROPSTEN_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ETH_ACCOUNT_KEY}`],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.MAINNET_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ETH_ACCOUNT_KEY}`],
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.KOVAN_INFURA_API_KEY}`,
      accounts: [`0x${process.env.ETH_ACCOUNT_KEY}`],
    }
  },
  etherscan: {
      apiKey: 'TJ1MBI2J7FEICQY3GHNY8G8SXZ51UHSCZC'
  },
}
