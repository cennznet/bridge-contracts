/**
 * For more usage and extention, check out https://github.com/winstonjs/winston
 *
 * For cloudwatch configuring, check out https://github.com/lazywithclass/winston-cloudwatch
 */
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: `logs/${Date.now()}.log`, level: 'info' }),
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
    })
  ]
});

module.exports = logger;
