import winston from 'winston';
import { TransformableInfo } from 'logform';

const customFormat = {
  transform: (info: TransformableInfo, opts?: unknown) => {
    const formatter = ({ timestamp, level, message, ...metadata }: TransformableInfo & { 
      timestamp?: string; 
      duration?: number;
      error?: { stack?: string };
    }) => {
      const msg = {value: `[${timestamp}] [${level}]: ${message}`};
      if (metadata.duration) {
        msg.value += ` (${metadata.duration}ms)`;
      }
      if (metadata.error && metadata.error.stack) {
        msg.value += `\n${metadata.error.stack}`;
      }
      return msg;
    };
    
    const msgObj = formatter(info);
    
    info[Symbol.for('message')] = msgObj.value;
    
    return info;
  }
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'jucepe-automation' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

export default logger;
