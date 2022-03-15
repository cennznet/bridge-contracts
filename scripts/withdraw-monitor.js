const ethers = require('ethers');
const pegAbi = require("../abi/ERC20Peg.json").abi;
const logger = require('./logger');

const ETH_NETWORK = process.env.ETH_NETWORK;
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const PEG_CONTRACT_ADDR = process.env.PEG_CONTRACT;


let provider = new ethers.providers.InfuraProvider(ETH_NETWORK, INFURA_API_KEY);
let peg = new ethers.Contract(PEG_CONTRACT_ADDR, pegAbi, provider);
logger.info('starting to do subscription to the contract.');
peg.on("Withdraw", async (eventInfo) => {
    logger.info(`Got the event...${JSON.stringify(eventInfo)}`);
    logger.info('*****************************************************');
});