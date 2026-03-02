// config/rateLimitSchedules.js
// Aggressive schedule for admin login: 0ms, 1min, 5min, 15min, 1h
const ADMIN_LOGIN_SCHEDULE = [0, 60_000, 300_000, 900_000, 3_600_000];

module.exports = { ADMIN_LOGIN_SCHEDULE };
