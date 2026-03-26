"use strict";

const AppError = require("../errors/AppError");

/**
 * Returns an Express middleware that validates req[source] against a Zod schema.
 *
 * On success, req[source] is replaced with the parsed/coerced data so downstream
 * handlers receive clean, typed values.
 *
 * On failure, calls next(AppError(400, VALIDATION_ERROR)) with a fields array
 * that mirrors the { field, message } convention used across the application.
 *
 * @param {import("zod").ZodTypeAny} schema
 * @param {"body"|"query"|"params"} [source="body"]
 *
 * @example
 * // In a route file:
 * router.post("/models", jsonParser, validate(createModelBodySchema), controller.createModel);
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || source,
        message: issue.message,
      }));
      return next(new AppError("Dados inválidos.", "VALIDATION_ERROR", 400, { fields }));
    }
    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
