const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const QTY_MIN = 1;
const QTY_MAX = 10000;

/**
 * Validates that a quantity value is an integer in [QTY_MIN, QTY_MAX].
 * Returns an AppError (400) if invalid, or null if valid.
 *
 * @param {*} quantidade - Raw value from request body
 * @returns {AppError|null}
 */
function validateQuantity(quantidade) {
  const n = Number(quantidade);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < QTY_MIN || n > QTY_MAX) {
    return new AppError(
      `quantidade deve ser um inteiro entre ${QTY_MIN} e ${QTY_MAX}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
  return null;
}

module.exports = { validateQuantity, QTY_MIN, QTY_MAX };
