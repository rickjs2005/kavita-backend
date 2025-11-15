const { Writable } = require("stream");

const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const levelNames = Object.keys(LEVELS);

const normalizeLevel = (value) => {
  if (!value) return "info";
  if (typeof value === "number") {
    const match = levelNames.find((name) => LEVELS[name] === value);
    return match || "info";
  }
  return levelNames.includes(value) ? value : "info";
};

const isWritable = (stream) =>
  stream && typeof stream.write === "function" && stream instanceof Writable;

const createLogger = (options = {}) => {
  const level = normalizeLevel(
    options.level || process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")
  );

  const baseBindings = {
    service: "kavita-backend",
    env: process.env.NODE_ENV || "development",
    ...options.base,
  };

  const destination = isWritable(options.destination) ? options.destination : process.stdout;

  const minLevel = LEVELS[level];

  const serializeError = (error) => ({
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  const write = (levelName, bindings, firstArg, maybeMessage) => {
    if (LEVELS[levelName] < minLevel) return;

    const time = Date.now();
    const payload = {
      time,
      level: LEVELS[levelName],
      ...baseBindings,
      ...(bindings || {}),
    };

    let msg;
    let data;

    if (firstArg instanceof Error) {
      data = { error: serializeError(firstArg) };
      msg = maybeMessage || firstArg.message;
    } else if (typeof firstArg === "object" && firstArg !== null) {
      data = firstArg;
      msg = maybeMessage || firstArg.msg || firstArg.message;
    } else {
      msg = String(firstArg);
    }

    if (data) {
      Object.assign(payload, data);
    }

    if (msg) {
      payload.msg = msg;
    }

    destination.write(`${JSON.stringify(payload)}\n`);
  };

  const logger = {};

  levelNames.forEach((name) => {
    logger[name] = (firstArg, message) => write(name, null, firstArg, message);
  });

  logger.child = (bindings = {}) =>
    createLogger({
      ...options,
      base: { ...baseBindings, ...bindings },
      destination,
      level,
    });

  logger.flush = () => {
    if (typeof destination.flush === "function") {
      destination.flush();
    }
  };

  return logger;
};

const defaultLogger = createLogger();

module.exports = defaultLogger;
module.exports.createLogger = createLogger;
