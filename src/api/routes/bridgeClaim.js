const { BRIDGE_CLAIM, WITHDRAW_PROOF, EVENT_PROOF } = require('../../mongo/models');
const { NotFound } = require('http-errors')

async function routes (fastify) {
    const collectionBridgeClaim = fastify.mongo.db.collection(BRIDGE_CLAIM);
    const userWithdrawal = fastify.mongo.db.collection(WITHDRAW_PROOF);
    const eventProof = fastify.mongo.db.collection(EVENT_PROOF);
    fastify.register(require('fastify-cors'), {
        "origin": '*',
    })
    fastify.get('/transactions/:txHash', async (request) => {
      const result = await collectionBridgeClaim.findOne({ txHash: request.params.txHash });
      if (!result) {
          throw new NotFound();
      }
      return result
    });

    fastify.get('/transactions/pending', async () => {
        let pendingWithdrawalsProm = userWithdrawal.find({"withdrawals": {"$elemMatch": {"hasClaimed": false}}}).toArray();
        let pendingDepositsProm = collectionBridgeClaim.find({$or:[{"status": "EthereumConfirming"}, {"status": "CennznetConfirming"}]}).toArray();
        let [pendingDeposits, pendingWithdrawals] = await Promise.all([pendingDepositsProm, pendingWithdrawalsProm]);
        //flatten results
        pendingWithdrawals = pendingWithdrawals.map(userWithdrawals => {
            return userWithdrawals.withdrawals.filter(tx => !tx.hasClaimed);
        }).flat();
        let pendingBridgeTxs = pendingWithdrawals.concat(pendingDeposits);
        pendingBridgeTxs = pendingBridgeTxs.map(tx => {
            if(tx.cennznetAddress) tx.txType = "deposit";
            else tx.txType = "withdrawal";
            return tx;
        })
        return pendingBridgeTxs;
    });


    // Get all withdraw proofs from db, for which either address is CENNZnetAddress
    fastify.get('/withdrawals/:address', async (request) => {
        const eventProofDetails = await userWithdrawal.findOne({
            _id: request.params.address
        });
        if (!eventProofDetails) {
            throw new NotFound();
        }
        return eventProofDetails;
    });

    // Get all withdraw proofs from db, for which either address is CENNZnetAddress
    fastify.get('/proofs/:proofId', async (request) => {
        const eventProofDetails = await eventProof.findOne({
            _id: request.params.proofId
        });

        if (!eventProofDetails) {
            throw new NotFound();
        }
        return eventProofDetails;
    });

}

module.exports = routes
