class ValidationError extends Error {
  constructor(message = "Dados inválidos", details) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    if (details) {
      this.details = details;
    }
  }
}

const ensureObject = (value) => (value && typeof value === "object" ? value : {});

function validate(schema = {}) {
  return (req, _res, next) => {
    try {
      if (schema.body) {
        const nextBody = schema.body(ensureObject(req.body));
        if (nextBody !== undefined) req.body = nextBody;
      }
      if (schema.query) {
        const nextQuery = schema.query(ensureObject(req.query));
        if (nextQuery !== undefined) req.query = nextQuery;
      }
      if (schema.params) {
        const nextParams = schema.params(ensureObject(req.params));
        if (nextParams !== undefined) req.params = nextParams;
      }
      next();
    } catch (err) {
      if (err instanceof ValidationError) {
        return next(err);
      }
      const error = new ValidationError(err.message || "Payload inválido");
      if (err.details) error.details = err.details;
      return next(error);
    }
  };
}

function requireFields(required = {}) {
  const { body = [], query = [], params = [] } = required;

  return validate({
    body: (input) => {
      const missing = body.filter((field) => input[field] === undefined || input[field] === "");
      if (missing.length) {
        throw new ValidationError("Campos obrigatórios ausentes", { location: "body", missing });
      }
      return input;
    },
    query: (input) => {
      const missing = query.filter((field) => input[field] === undefined || input[field] === "");
      if (missing.length) {
        throw new ValidationError("Parâmetros obrigatórios ausentes", { location: "query", missing });
      }
      return input;
    },
    params: (input) => {
      const missing = params.filter((field) => input[field] === undefined || input[field] === "");
      if (missing.length) {
        throw new ValidationError("Parâmetros de rota obrigatórios ausentes", { location: "params", missing });
      }
      return input;
    },
  });
}

module.exports = { validate, requireFields, ValidationError };
