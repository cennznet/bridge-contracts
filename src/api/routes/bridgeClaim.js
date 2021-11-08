const { BRIDGE_CLAIM } = require('../../mongo/models');

async function routes (fastify) {
    const collectionBridgeClaim = fastify.mongo.db.collection(BRIDGE_CLAIM);

    fastify.get('/transactions/:txHash', async (request) => {
      const result = await collectionBridgeClaim.findOne({ txHash: request.params.txHash });
      if (!result) {
        throw new Error('Record not found')
      }
      return result
    })

}

module.exports = routes
