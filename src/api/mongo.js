const fastifyPlugin = require('fastify-plugin');
const fastifyMongo = require('fastify-mongodb');

async function mongoConnector (fastify) {
    const connectionStr = process.env.MONGO_URI;
  fastify.log.info(`connecting to mongodb ${connectionStr}`);
  fastify.register(fastifyMongo, {
    url: `mongodb://${connectionStr}`
  });
}

// Wrapping a plugin function with fastify-plugin exposes the decorators
// and hooks, declared inside the plugin to the parent scope.
module.exports = fastifyPlugin(mongoConnector);
