// utils/httpError.js
const AppError = require("../errors/AppError");
module.exports = (message, code, status) => new AppError(message, code, status);
