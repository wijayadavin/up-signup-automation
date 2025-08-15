import pino from 'pino';

let logger: pino.Logger | null = null;

export function getLogger(name: string): pino.Logger {
  if (!logger) {
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    logger = pino({
      level: logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return logger.child({ module: name });
}
