import pino from "pino";

const isDebug = process.env.DEBUG === "true" || process.env.LOG_LEVEL === "debug";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDebug ? "debug" : "silent"),
  transport: isDebug
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

// Create child loggers for different modules
export const createLogger = (module: string) => logger.child({ module });

export default logger;

