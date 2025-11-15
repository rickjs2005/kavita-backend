const metrics = require("../monitoring/metrics");
const alerts = require("../monitoring/alerts");

module.exports = (req, res, next) => {
  const route = req.originalUrl ? req.originalUrl.split("?")[0] : req.url;
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;
    const statusCode = res.statusCode;

    metrics.recordDuration({
      method: req.method,
      route,
      statusCode,
      durationMs,
    });

    if (statusCode >= 500) {
      metrics.recordError({
        method: req.method,
        route,
      });
    }

    alerts.recordRequest({
      method: req.method,
      route,
      statusCode,
      durationMs,
      isError: statusCode >= 500,
      requestId: req.id || res.getHeader("x-request-id"),
    });
  });

  next();
};
