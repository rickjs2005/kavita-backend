const durations = new Map();
const errors = new Map();

const buildKey = (method, route, statusCode) =>
  `${method.toUpperCase()}|${route}|${statusCode}`;

const buildErrorKey = (method, route) => `${method.toUpperCase()}|${route}`;

const normalizeRoute = (route) => route || "unknown";

const recordDuration = ({ method, route, statusCode, durationMs }) => {
  const key = buildKey(method, normalizeRoute(route), statusCode);
  const snapshot = durations.get(key) || { count: 0, sum: 0 };
  snapshot.count += 1;
  snapshot.sum += Number.isFinite(durationMs) ? durationMs : 0;
  durations.set(key, snapshot);
};

const recordError = ({ method, route }) => {
  const key = buildErrorKey(method, normalizeRoute(route));
  const value = errors.get(key) || 0;
  errors.set(key, value + 1);
};

const formatLabel = (labels) =>
  Object.entries(labels)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\"')}"`)
    .join(",");

const metricsHeader = () => `# HELP http_request_duration_ms Summary of HTTP request durations in milliseconds\n` +
  `# TYPE http_request_duration_ms summary\n` +
  `# HELP http_request_errors_total Total number of HTTP error responses\n` +
  `# TYPE http_request_errors_total counter\n`;

const getMetrics = () => {
  let output = metricsHeader();

  durations.forEach((value, key) => {
    const [method, route, statusCode] = key.split("|");
    const labels = { method, route, status_code: statusCode };
    output += `http_request_duration_ms_sum{${formatLabel(labels)}} ${value.sum}\n`;
    output += `http_request_duration_ms_count{${formatLabel(labels)}} ${value.count}\n`;
  });

  errors.forEach((value, key) => {
    const [method, route] = key.split("|");
    const labels = { method, route };
    output += `http_request_errors_total{${formatLabel(labels)}} ${value}\n`;
  });

  return output;
};

const resetMetrics = () => {
  durations.clear();
  errors.clear();
};

module.exports = {
  recordDuration,
  recordError,
  getMetrics,
  resetMetrics,
};
