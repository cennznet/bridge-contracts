const { BRIDGE_CLAIM } = require('../../mongo/models');
const { NotFound } = require('http-errors')

async function routes (fastify) {
    const collectionBridgeClaim = fastify.mongo.db.collection(BRIDGE_CLAIM);
    fastify.register(require('fastify-cors'), {
        "origin": '*',
    })
    fastify.get('/transactions/:txHash', async (request) => {
      const result = await collectionBridgeClaim.findOne({ txHash: request.params.txHash });
      if (!result) {
          throw new NotFound();
      }
      return result
    })

}

module.exports = routes
