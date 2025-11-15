const { ValidationError } = require("./validation");

function serialize(handler, options = {}) {
  const { status, transform } = options;

  return async (req, res, next) => {
    try {
      const result = await handler(req, res, next);
      if (res.headersSent) {
        return;
      }

      const data = typeof transform === "function" ? transform(result, req, res) : result;

      if (status != null) {
        res.status(status);
      }

      res.success(data ?? null);
    } catch (error) {
      if (error instanceof ValidationError) {
        return next(error);
      }
      return next(error);
    }
  };
}

module.exports = { serialize };
