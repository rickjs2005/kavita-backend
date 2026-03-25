"use strict";

const AppError = require("../errors/AppError");

/**
 * Returns an Express middleware that validates req[source] against a Zod schema.
 *
 * On success, req[source] is replaced with the parsed/coerced data so downstream
 * handlers receive clean, typed values.
 *
 * On failure, calls next(AppError(400, VALIDATION_ERROR)) with a fields array
 * that mirrors the { field, reason } convention used across the drones module.
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
        reason: issue.message,
      }));
      return next(new AppError("Dados inválidos.", 400, "VALIDATION_ERROR", { fields }));
    }
    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
