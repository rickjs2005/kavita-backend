const axios = require("axios");
const nodemailer = require("nodemailer");
const logger = require("../config/logger");

let samples = [];
const lastAlert = {
  error_rate: 0,
  latency: 0,
};

const now = () => Date.now();

const config = () => ({
  windowMs: Number(process.env.ALERT_WINDOW_MS || 5 * 60 * 1000),
  errorRateThreshold: Number(process.env.ALERT_ERROR_RATE_THRESHOLD || 0.2),
  latencyThreshold: Number(process.env.ALERT_LATENCY_THRESHOLD_MS || 2000),
  minRequests: Number(process.env.ALERT_MIN_REQUESTS || 20),
  cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 10 * 60 * 1000),
});

const pruneSamples = (windowMs) => {
  const limit = now() - windowMs;
  samples = samples.filter((entry) => entry.timestamp >= limit);
};

const sendSlack = async (text) => {
  if (!process.env.SLACK_WEBHOOK_URL) {
    logger.debug("Slack webhook não configurado, alerta não enviado");
    return false;
  }

  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text });
    return true;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, "Falha ao enviar alerta para Slack");
    return false;
  }
};

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: SMTP_USER
      ? {
          user: SMTP_USER,
          pass: SMTP_PASSWORD,
        }
      : undefined,
  });
  return transporter;
};

const sendEmail = async (subject, text) => {
  const mailer = getTransporter();
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_TO;
  if (!mailer || !to || !from) {
    logger.debug("Transporte SMTP ou destinatário não configurado, alerta por e-mail não enviado");
    return false;
  }

  try {
    await mailer.sendMail({
      from,
      to,
      subject,
      text,
    });
    return true;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, "Falha ao enviar alerta por e-mail");
    return false;
  }
};

const dispatchAlert = async (type, value, threshold, context) => {
  const message =
    `Alerta de ${type} acionado: valor=${value.toFixed(3)} threshold=${threshold}.` +
    ` Rota=${context.route} Método=${context.method} Status=${context.statusCode} RequestId=${context.requestId}`;

  const results = await Promise.allSettled([
    sendSlack(message),
    sendEmail(`Alerta de ${type}`, message),
  ]);

  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value) {
      logger.info({ type }, "Alerta enviado com sucesso");
    }
  });
};

const shouldThrottle = (type, cooldownMs) => now() - lastAlert[type] < cooldownMs;

const recordRequest = (data) => {
  const settings = config();
  const timestamp = now();
  samples.push({ ...data, timestamp });
  pruneSamples(settings.windowMs);

  if (samples.length < settings.minRequests) {
    return;
  }

  const total = samples.length;
  const errorCount = samples.filter((entry) => entry.isError).length;
  const avgLatency = samples.reduce((acc, entry) => acc + entry.durationMs, 0) / total;
  const errorRate = errorCount / total;

  if (errorRate >= settings.errorRateThreshold && !shouldThrottle("error_rate", settings.cooldownMs)) {
    lastAlert.error_rate = timestamp;
    dispatchAlert("error_rate", errorRate, settings.errorRateThreshold, data).catch((error) => {
      logger.error({ error }, "Falha ao processar alerta de taxa de erro");
    });
  }

  if (avgLatency >= settings.latencyThreshold && !shouldThrottle("latency", settings.cooldownMs)) {
    lastAlert.latency = timestamp;
    dispatchAlert("latency", avgLatency, settings.latencyThreshold, data).catch((error) => {
      logger.error({ error }, "Falha ao processar alerta de latência");
    });
  }
};

const reset = () => {
  samples = [];
  lastAlert.error_rate = 0;
  lastAlert.latency = 0;
};

module.exports = {
  recordRequest,
  reset,
};
