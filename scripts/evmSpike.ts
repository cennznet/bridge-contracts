const abi = require("../abi/TestToken.json").abi;
require("dotenv").config();
const ethers = require('ethers');
async function main (networkName, bridgeContractAddress) {

    // const infuraProvider = new ethers.providers.InfuraProvider('kovan',
    //     process.env.INFURA_API_KEY
    // );
    //
    // const txHash = '0xc1a6f94d0c289f5f409402e7b5eae4ca0d0549cbee2496a5da86d88c75123099';
    // const receiptKovan = await infuraProvider.getTransactionReceipt(txHash);
    // console.log('data::',receiptKovan.logs[0].data);
    // console.log('receiptKovan JSON::',receiptKovan);
    // const d = ethers.utils.defaultAbiCoder.decode(
    //     ['address', 'uint256', 'bytes32'],
    //     ethers.utils.hexDataSlice(receiptKovan.logs[0].data,0)
    // );
    // console.log('decoded data:',d);
    // console.log('balance :',d[1].toString());
    // const ts = await infuraProvider.getTransaction(txHash);
    // console.log('tx detail:',ts);
    // const tx = ethers.utils.parseTransaction( ts.raw );
    // console.log('tx from raw:', tx);




    const provider = ethers.getDefaultProvider("https://nikau.centrality.me/public")

    const receipt = await provider.getTransactionReceipt('0x56667995bea49e0c159334425a60d7558f9bf6d1eb7b3a4e6c25ece43325387c');
   // const receipt = await provider.getTransactionReceipt('0x5a08017845a1bc52eeafe90b12f74d7b73534ba808cb822a54ee46eaad8d4349');
    console.log('receipt::',receipt);
    let iface = new ethers.utils.Interface(abi)
    // const decodedData = ethers.utils.defaultAbiCoder.decode(
    //     [ 'uint256'],
    //     receipt.logs[0].data
    // );
    const decodedData = iface.parseLog(receipt.logs[0]);
    console.log('Input to contract:', decodedData);

    // const filter = peg.filters.Deposit()
    // filter.fromBlock = 14267852;
    // filter.toBlock = "latest";
    const filter = {
        // address: receipt.contractAddress,
        topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            // hexZeroPad(myAddress, 32)
        ]
    };
    const contract = new ethers.Contract(receipt.contractAddress, abi, provider);
    //const filter = contract.filters.Transfer()
    //console.log('contract:',contract);
    //let iface = new ethers.utils.Interface(abi)
    provider.getLogs(filter).then((logs) => {
        console.log('logs:',logs);

        logs.forEach((log) => {
            const data = contract.interface.parseLog(log);
            const argsData = data.args;
            console.log('argsData:',argsData);
        })
    })

    // const block = await provider.getBlockWithTransactions( receipt.blockNumber );
    // console.log('block:', block);
    //
    // console.log('value:', block.transactions[0].value.toString())
    // const tx = ethers.utils.parseTransaction( block.transactions[0].raw );
    // console.log('tx from raw:', tx);
    // const raw = block.transactions[0].raw;
    // const rawValue = api.registry.createType('GA', raw);
    // console.log('Raw value:', rawValue.toJSON());


}

const networkName = process.env.NETWORK;
const bridgeContractAddress = process.env.BRIDGE_CONTRACT;
main(networkName, bridgeContractAddress).catch((err) => console.log(err));
