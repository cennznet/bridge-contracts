/**
 * For more usage and extention, check out https://github.com/winstonjs/winston
 *
 * For cloudwatch configuring, check out https://github.com/lazywithclass/winston-cloudwatch
 */
const winston = require('winston');
require('winston-daily-rotate-file');

const transport = new winston.transports.DailyRotateFile({
  filename: 'ValidatorRelayer-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  createSymlink: true
});

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    transport,
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
    })
  ]
});

module.exports = logger;
