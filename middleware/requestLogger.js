const { v4: uuidv4 } = require("uuid");
const logger = require("../config/logger");

const sanitizeRoute = (req) => {
  if (req.route && req.route.path) {
    return `${req.baseUrl || ""}${req.route.path}`;
  }
  return req.originalUrl ? req.originalUrl.split("?")[0] : req.url;
};

module.exports = (req, res, next) => {
  const requestId =
    req.headers["x-request-id"] || req.headers["request-id"] || uuidv4();

  res.setHeader("x-request-id", requestId);

  const requestLogger = logger.child({
    requestId,
    method: req.method,
    route: sanitizeRoute(req),
  });

  req.id = requestId;
  req.log = requestLogger;

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;
    const route = sanitizeRoute(req);
    const logPayload = {
      statusCode: res.statusCode,
      durationMs,
      route,
      contentLength: res.getHeader("content-length"),
    };

    if (res.locals && res.locals.error) {
      logPayload.error = res.locals.error;
    }

    if (res.statusCode >= 500) {
      requestLogger.error(logPayload, "request completed with error");
    } else if (res.statusCode >= 400) {
      requestLogger.warn(logPayload, "request completed with warning");
    } else {
      requestLogger.info(logPayload, "request completed");
    }
  });

  next();
};
