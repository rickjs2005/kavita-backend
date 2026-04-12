// config/rateLimitSchedules.js
// Aggressive schedule for admin login: 0ms, 1min, 5min, 15min, 1h
const ADMIN_LOGIN_SCHEDULE = [0, 60_000, 300_000, 900_000, 3_600_000];

// Checkout: 5 tentativas livres, depois 30s, 2min, 10min
// Usuário legítimo faz 1-2 tentativas. 5 livres cobrem retries após erros de validação.
const CHECKOUT_SCHEDULE = [0, 0, 0, 0, 0, 30_000, 120_000, 600_000];

// Preview cupom: 8 tentativas livres, depois 30s, 2min
// Permite testar vários códigos antes de bloquear.
const COUPON_PREVIEW_SCHEDULE = [0, 0, 0, 0, 0, 0, 0, 0, 30_000, 120_000];

module.exports = { ADMIN_LOGIN_SCHEDULE, CHECKOUT_SCHEDULE, COUPON_PREVIEW_SCHEDULE };
