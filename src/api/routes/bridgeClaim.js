const { BRIDGE_CLAIM } = require('../../mongo/models');

async function routes (fastify, options) {
    const collectionBridgeClaim = fastify.mongo.db.collection(BRIDGE_CLAIM);

    fastify.get('/bridge/txHash/:txHash', async (request, reply) => {
      const result = await collectionBridgeClaim.findOne({ txHash: request.params.txHash });
      if (!result) {
        throw new Error('invalid value')
      }
      return result
    })

}

module.exports = routes
