const Fastify = require('fastify');
const mongoConnector = require('./mongo.js');
const bridge = require('./routes/bridgeClaim.js');
require('dotenv').config();

const fastify = Fastify({
  logger: true
})
fastify.register(mongoConnector)
fastify.register(bridge)

// To listen on all available IPv4 interfaces this should be modified to listen on 0.0.0.0
fastify.listen(3000, '0.0.0.0', function (err) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
