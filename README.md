# bridge-contracts
CENNZnet ethereum bridge contracts.

__CENNZnet Bridge__  
Maintains the active and historic set of CENNZnet validator public keys / addresses
Provides external `verifyMessage` to allow other contracts to prove messages were signed by CENNZnet validators

__ERC20 Peg__  
Manages a Generic Asset - ERC20 peg using the CENNZnet ethereum bridge.  
Deposited ERC20 tokens (and native Eth) are claimable on CENNZnet for GA equivalents.  
Withdrawing GA equivalents requires a signed proof from CENNZnet validators.  


## Deployments
```js
// deployed contract instances
const MAINNET_V1 = {
    bridge: "0x369e2285CCf43483e76746cebbf3d1d6060913EC",
    peg: "0x8F68fe02884b2B05e056aF72E4F2D2313E9900eC",
};
const MAINNET_V2 = {
    bridge: "0xf7997B93437d5d2AC226f362EBF0573ce7a53930",
    peg: "0x76BAc85e1E82cd677faa2b3f00C4a2626C4c6E32",
};
const KOVAN_V1 = {
    bridge: "0x9AFe4E42d8ab681d402e8548Ee860635BaA952C5",
    peg: "0x5Ff2f9582FcA1e11d47e4e623BEf4594EB12b30d",
};
const KOVAN_V2 = {
    bridge: "0x6484A31Df401792c784cD93aAAb3E933B406DdB3",
    peg: "0xa39E871e6e24f2d1Dd6AdA830538aBBE7b30F78F",
    wcennz: "0xB7e26f93211932865430a03236Dd043F7248993b,"
};

const ROPSTEN_V1 = {
    bridge: "0x25b53B1bDc5F03e982c383865889A4B3c6cB98AA",
    peg: "0x927a710681B63b0899E28480114Bf50c899a5c27",
};

const ROPSTEN_V2 = {
    bridge: "0x452b8dd7b00D51e48cEF6254a48B7426d44658B8",
    peg: "0x4C411B3Bf36D6DE908C6f4256a72B85E3f2B00bF",
    wcennz: "0xcdA767469D434c14D320e1A78D5b612B72B52bf0",
}
```

## Dev Setup
start a CENNZnet validator node.  
```bash
docker run -d \
  -p 9944:9944 \
  cennznet/cennznet:2.0.0 \
  --dev --tmp \
  --unsafe-rpc-external \
  --unsafe-ws-external \
  --eth-http=http://localhost:8545 # the local hardhat node RPC endpoint
```

start a hardhat Ethereum node and deploy contracts
```bash
# start dev node
npx hardhat node

# deploy contracts
yarn deploy

# run a test eth deposit
yarn eth_e2e
```

## Publish contract
```bash
yarn publish CONTRACT_ADDRESS ARGS
```

## Run Relayer Services
```bash
# transaction status api server
docker run -p 3000:3000 \
    -e MONGO_URI="mongo+srv://<username>:<password>/bridgeDb" \
    cennznet/bridge-relayer yarn run api

# depositClaim relayer
docker run -e MONGO_URI="mongo+srv://<username>:<password>/bridgeDb" \
           -e NETWORK="rata|nikau|azalea" \
           -e PEG_CONTRACT="0x...." \
           -e CENNZNET_SECRET="0x12312321 | //<uri>" \
           -e SLACK_SECRET="......" \
           -e ETH_ACCOUNT_KEY="0x..." \
           cennznet/bridge-relayer yarn run claimRelayer ropsten|kovan|mainnet

# validator set relayer
docker run \
    -e NETWORK="rata|nika|azalea" \
    -e BRIDGE_CONTRACT="0x123123....." \
    -e CENNZNET_SECRET="0x12312321 | //<uri>" \
    -e SLACK_SECRET="...." \
    cennznet/bridge-relayer yarn run validatorRelayer ropsten|kovan|mainnet
```

## Setup
```bash
# install
yarn
# compile
yarn build
# test
yarn test
```

## Run
deploy bridge contract locally
```bash
# start local Eth node
npx hardhat node
# deploy contracts and issue a test deposit
yarn deploy
```

`yarn deploy` will send a test deposit of `123` to CENNZnet address: `0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10` e.g.

```bash
eth_sendTransaction
  Contract call:       CENNZnetBridge#deposit
  Transaction:         0xbf36caa71a9c2b6e6713e1ebfa831c870d3bc63e5db297837fbc0bd2ed2f9f89
  From:                0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
  To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
  Value:               0 ETH
  Gas used:            52014 of 67048
  Block #5:            0x6ed3fe2ccc6746012d0bd6d2f36ce5026088357f716bd48f21518a020682c217
```

## Other
Example CENNZnet account for accepting ERC20 deposits
```
subkey inspect //BridgeTest
Secret Key URI `//BridgeTest` is account:
  Secret seed:      0x98e231c854da2ff30765b6b547197c3455be59b31dabeb092e05fdb97ba90b96
  Public key (hex): 0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10
  Account ID:       0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10
  SS58 Address:     5FyKggXKhqAwJ2o9oBu8j3WHbCfPCz3uCuhTc4fTDgVniWNU
```

example ERC20 deposit event
```json
[
    {
        // erc20 contract
        "address": "0x458E4CE1Ee5f8E393006c797aa4D8c490CD57e6D",
        "topics": [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x00000000000000000000000072d1b5d3fc22d2be6e1076435a11fe9863d8aeb2",
            "0x00000000000000000000000035e752f4ea0645ef8793b37b5757573ede504c47"
        ],
        "data": "0x0000000000000000000000000000000000000000000000000000000000003039",
        "blockNumber": 21,
        "transactionHash": "0xb2e5dbebff2f44503b2514ce2254899180e4244942af68def94ba45dcfa7a84a",
        "transactionIndex": 0,
        "blockHash": "0xb1dc17eaea52ccb042ef3daf404c34ab9a21eacd8fa471573a8b3e760a25776f",
        "logIndex": 0,
        "removed": false,
        "id": "log_b0a63c48"
    },
    {
        // erc20 contract
        "address": "0x458E4CE1Ee5f8E393006c797aa4D8c490CD57e6D",
        "topics": [
            "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
            "0x00000000000000000000000072d1b5d3fc22d2be6e1076435a11fe9863d8aeb2",
            "0x00000000000000000000000035e752f4ea0645ef8793b37b5757573ede504c47"
        ],
        "data": "0x000000000000000000000000000000000000000000000000000000000001b207",
        "blockNumber": 21,
        "transactionHash": "0xb2e5dbebff2f44503b2514ce2254899180e4244942af68def94ba45dcfa7a84a",
        "transactionIndex": 0,
        "blockHash": "0xb1dc17eaea52ccb042ef3daf404c34ab9a21eacd8fa471573a8b3e760a25776f",
        "logIndex": 1,
        "removed": false,
        "id": "log_f8ea2071"
    },
    {
        // bridge contract
        "address": "0x35e752f4Ea0645Ef8793B37B5757573EdE504c47",
        "topics": [
            "0x260e406acb5c2890984616f2069afabc0e70de193cd93377cbe69426ef5334c5",
            "0x00000000000000000000000072d1b5d3fc22d2be6e1076435a11fe9863d8aeb2"
        ],
        "data": "0x000000000000000000000000458e4ce1ee5f8e393006c797aa4d8c490cd57e6d0000000000000000000000000000000000000000000000000000000000003039acd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c1",
        "blockNumber": 21,
        "transactionHash": "0xb2e5dbebff2f44503b2514ce2254899180e4244942af68def94ba45dcfa7a84a",
        "transactionIndex": 0,
        "blockHash": "0xb1dc17eaea52ccb042ef3daf404c34ab9a21eacd8fa471573a8b3e760a25776f",
        "logIndex": 2,
        "removed": false,
        "id": "log_671685bd"
    }
]
```

## Testing
ensure contract address in module matches deployed

-> @cennznet/api branch with latest metadata and types
yarn build:release

@cennznet/types: npm link
@cennznet/api: npm link && npm link @cennznet/types
cennznet/cli: npm link @cennznet/api

replace 'rxjs/operators' with 'rxjs/operators/index.js' in packages/api/build/

cennznet: 0x1215b4Ec8161b7959A115805bf980e57A085c3E5
yolo: 0xbe4d356d1C68E22aFeE70B4510ec8b31e389c759

## submit claim
```js
    let depositTxHash = "0xbf36caa71a9c2b6e6713e1ebfa831c870d3bc63e5db297837fbc0bd2ed2f9f89";
    let claim = {
         tokenAddress: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
         amount: "123",
         beneficiary: "0xacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10"
    };
    let result = await api.tx.erc20Peg.depositClaim(depositTxHash, claim).signAndSend(toyKeyring.alice);
```

## query tx receipt
request
```bash
curl localhost:8545 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params": ["0x185e85beb3296c7339954811cc682e3f992573ad3eecd37409e0ed763448d303"],"id":1}'
```

response
```json
{"jsonrpc":"2.0","id":1,"result":{"blockHash":"0xa97fa85e0f38526be39a29eb77c07ad9f18c315f8eb6ab7d44028581c1518ec1","blockNumber":"0x5","contractAddress":null,"cumulativeGasUsed":"0x1685c","effectiveGasPrice":"0x30cb962f","from":"0xec2c80a819ee8e42c624f6a5de930e8184c0801f","gasUsed":"0x1685c","logs":[{"address":"0x17c54edee4d6bccf2379daa328dcc0fbd9c6ce2b","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x000000000000000000000000ec2c80a819ee8e42c624f6a5de930e8184c0801f","0x00000000000000000000000087015d61b82a3808d9720a79573bf75deb8a1e90"],"data":"0x000000000000000000000000000000000000000000000000000000000000007b","blockNumber":"0x5","transactionHash":"0x185e85beb3296c7339954811cc682e3f992573ad3eecd37409e0ed763448d303","transactionIndex":"0x0","blockHash":"0xa97fa85e0f38526be39a29eb77c07ad9f18c315f8eb6ab7d44028581c1518ec1","logIndex":"0x0","removed":false},{"address":"0x17c54edee4d6bccf2379daa328dcc0fbd9c6ce2b","topics":["0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925","0x000000000000000000000000ec2c80a819ee8e42c624f6a5de930e8184c0801f","0x00000000000000000000000087015d61b82a3808d9720a79573bf75deb8a1e90"],"data":"0x000000000000000000000000000000000000000000000000000000000001e1c5","blockNumber":"0x5","transactionHash":"0x185e85beb3296c7339954811cc682e3f992573ad3eecd37409e0ed763448d303","transactionIndex":"0x0","blockHash":"0xa97fa85e0f38526be39a29eb77c07ad9f18c315f8eb6ab7d44028581c1518ec1","logIndex":"0x1","removed":false},{"address":"0x87015d61b82a3808d9720a79573bf75deb8a1e90","topics":["0x76bb911c362d5b1feb3058bc7dc9354703e4b6eb9c61cc845f73da880cf62f61","0x000000000000000000000000ec2c80a819ee8e42c624f6a5de930e8184c0801f"],"data":"0x00000000000000000000000017c54edee4d6bccf2379daa328dcc0fbd9c6ce2b000000000000000000000000000000000000000000000000000000000000007bacd6118e217e552ba801f7aa8a934ea6a300a5b394e7c3f42cd9d6dd9a457c10","blockNumber":"0x5","transactionHash":"0x185e85beb3296c7339954811cc682e3f992573ad3eecd37409e0ed763448d303","transactionIndex":"0x0","blockHash":"0xa97fa85e0f38526be39a29eb77c07ad9f18c315f8eb6ab7d44028581c1518ec1","logIndex":"0x2","removed":false}],"logsBloom":"0x00000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000010000000200200000000000000000000000008000000000000000000000000000000000000000000000000000000001000000000000000000000000010000000000010000000800000000000000000000000000002000000000000000000000000000040000000020000000000000000000010000000000000000000000000000000000000000000000002000000000000000000000000200000000000008000000004000000000010001000000000000000020000000000000000000000000000001000000000","status":"0x1","to":"0x87015d61b82a3808d9720a79573bf75deb8a1e90","transactionHash":"0x185e85beb3296c7339954811cc682e3f992573ad3eecd37409e0ed763448d303","transactionIndex":"0x0","type":"0x0"}}
```
