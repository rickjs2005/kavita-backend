// middleware/errorHandler.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

module.exports = (err, req, res, _next) => {
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

  // Log interno (você vê no servidor)
  console.error("Erro:", {
    status,
    code,
    message: err.message,
    url: req.originalUrl,
    stack: err.stack,
  });

  return res.status(status).json({ code, message });
};
