import pino from "pino";
const pinoLogger = typeof pino === 'function' ? pino : pino.default;
export const logger = pinoLogger({
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "HH:MM:ss",
                ignore: "pid,hostname",
            },
        }
        : undefined,
});
export function createLogger(name) {
    return logger.child({ module: name });
}
