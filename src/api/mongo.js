const fastifyPlugin = require('fastify-plugin');
const fastifyMongo = require('fastify-mongodb');

async function mongoConnector (fastify, options) {
  connectionStr = `${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/admin`;
  fastify.log.info(`connecting to mongodb ${connectionStr}`);
  fastify.register(fastifyMongo, {
    url: `mongodb://${connectionStr}`
  });
}

// Wrapping a plugin function with fastify-plugin exposes the decorators	
// and hooks, declared inside the plugin to the parent scope.
module.exports = fastifyPlugin(mongoConnector);
