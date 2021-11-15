/**
 * For more usage and extention, check out https://github.com/winstonjs/winston
 */

const winston = require('winston');

const moment = require('moment');

 const logger_format = winston.format.printf( ({ level, message, timestamp , ...metadata}) => {
   let unix_timestamp = moment(timestamp).unix()
   let msg = `${timestamp} [${level}] ${unix_timestamp} ${message} `
   if(metadata) {
     msg += JSON.stringify(metadata)
   }
   return msg
 });

 const app_name = process.env.APP_NAME || "app";

 const file_transport = new winston.transports.File({
   filename: `logs/${app_name}.log`,
   maxsize: 2048000, // 2 MB
   maxFiles: 10,
 });
const console_transport = new winston.transports.Console({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.splat(),
      logger_format,
  )
});

 const logger = winston.createLogger({
   format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.splat(),
       logger_format,
   ),
   transports: [
     file_transport,
     console_transport
   ]
 });

module.exports = logger;
