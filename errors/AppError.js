const ERROR_CODES = require('../constants/ErrorCodes');
class AppError extends Error {
    constructor(message, code = ERROR_CODES.SERVER_ERROR, status = 500) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
module.exports = AppError;