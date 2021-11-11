const Fastify = require('fastify');
const mongoConnector = require('./mongo.js');
const bridge = require('./routes/bridgeClaim.js');
require('dotenv').config();

const fastify = Fastify({
  logger: true
})
fastify.register(mongoConnector)
fastify.register(bridge)

fastify.listen(3000, function (err) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
