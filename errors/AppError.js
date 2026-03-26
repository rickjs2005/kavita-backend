const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Erro padronizado da aplicação.
 *
 * Assinatura: new AppError(message, code, status, details?)
 *
 * @param {string} message   - Mensagem legível para o usuário
 * @param {string} code      - Código de erro (use ErrorCodes.js)
 * @param {number} status    - HTTP status code (400, 401, 404, 409, 500, ...)
 * @param {*}     [details]  - Objeto adicional de contexto (ex: { fields: [...] })
 *
 * @example
 * throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
 * throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields });
 */
class AppError extends Error {
  constructor(message, code, status, details = null) {
    super(message);
    this.code = code ?? ERROR_CODES.SERVER_ERROR;
    this.status = status ?? 500;
    this.statusCode = this.status;
    if (details !== null && details !== undefined) {
      this.details = details;
    }
  }
}

module.exports = AppError;
