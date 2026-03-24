const ERROR_CODES = require("../constants/ErrorCodes");

class AppError extends Error {
  /**
   * Suporta duas convenções de chamada:
   *   Nova (padrão): new AppError(message, code, status, details?)
   *   Legado:        new AppError(message, statusCode, code, details?)  ← drones controllers
   *
   * A detecção é feita pelo tipo do segundo argumento:
   *   - número → convenção legada (statusCode, code)
   *   - string → convenção nova (code, status)
   *
   * Quando todos os callers legados forem migrados, remover a detecção e
   * manter apenas a convenção nova.
   */
  constructor(message, codeOrStatus, statusOrCode, details = null) {
    super(message);

    if (typeof codeOrStatus === "number") {
      // Convenção legada: (message, statusCode, code, details)
      this.status = codeOrStatus;
      this.statusCode = codeOrStatus;
      this.code = statusOrCode ?? ERROR_CODES.SERVER_ERROR;
    } else {
      // Convenção nova: (message, code, status, details)
      this.code = codeOrStatus ?? ERROR_CODES.SERVER_ERROR;
      this.status = statusOrCode ?? 500;
      this.statusCode = this.status;
    }

    if (details !== null && details !== undefined) {
      this.details = details;
    }
  }
}

module.exports = AppError;