// middleware/errorHandler.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
const sentry = require("../lib/sentry");

module.exports = (err, req, res, _next) => {
  // Multer file upload errors (file too large, too many files, etc.)
  if (err.name === "MulterError") {
    const messages = {
      LIMIT_FILE_SIZE: "O arquivo enviado é muito grande. Reduza o tamanho e tente novamente.",
      LIMIT_FILE_COUNT: "Muitos arquivos enviados de uma vez.",
      LIMIT_UNEXPECTED_FILE: "Campo de upload inesperado.",
    };
    return res.status(400).json({
      ok: false,
      code: "FILE_TOO_LARGE",
      message: messages[err.code] || "Erro no upload do arquivo.",
      details: { field: err.field, multerCode: err.code },
    });
  }

  // Pool esgotado: todas as conexões ocupadas e fila cheia.
  // Retorna 503 para que load balancers e clientes possam tentar outro instância.
  if (err.code === "POOL_ENQUEUELIMIT") {
    return res.status(503).json({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "Servidor sobrecarregado. Tente novamente em alguns instantes.",
    });
  }

  const isAppError = err instanceof AppError;

  const status = isAppError ? err.status : (err.statusCode || err.status || 500);
  const code = isAppError ? err.code : ERROR_CODES.SERVER_ERROR;

  // Mensagem padrão
  let message = isAppError
    ? err.message
    : "Algo deu errado. Tente novamente mais tarde.";

  // Em produção, nunca expor detalhes de 500
  if (process.env.NODE_ENV === "production" && status >= 500) {
    message = "Ocorreu um erro interno. Tente novamente mais tarde.";
  }

  const logPayload = {
    err,
    status,
    code,
    url: req.originalUrl,
    method: req.method,
    requestId: req.id,
  };

  if (status >= 500) {
    logger.error(logPayload, "request error 5xx");

    // Resolve contexto de usuário entre os 4 tipos de auth do projeto.
    // Sentry user.id ajuda a agrupar erros do mesmo usuário; type permite
    // filtrar por área (cliente vs admin vs corretora vs produtor).
    let user;
    if (req.adminUser) {
      user = {
        id: `admin:${req.adminUser.id}`,
        email: req.adminUser.email,
        type: "admin",
      };
    } else if (req.corretoraUser) {
      user = {
        id: `corretora:${req.corretoraUser.id}`,
        type: "corretora",
        corretora_id: req.corretoraUser.corretora_id,
      };
    } else if (req.producerUser) {
      user = { id: `producer:${req.producerUser.id}`, type: "producer" };
    } else if (req.user) {
      user = { id: `user:${req.user.id}`, email: req.user.email, type: "user" };
    }

    sentry.captureException(err, {
      tags: {
        code,
        url: req.originalUrl,
        method: req.method,
        auth_type: user?.type ?? "anonymous",
      },
      extra: { status, requestId: req.id },
      user,
    });
  } else {
    logger.warn(logPayload, "request error 4xx");
  }

  const body = { ok: false, code, message };
  if (err.details != null) body.details = err.details;
  return res.status(status).json(body);
};
