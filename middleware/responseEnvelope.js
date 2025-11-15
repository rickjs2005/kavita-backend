const normalizeError = (error) => {
  if (error == null) {
    return null;
  }

  if (error instanceof Error) {
    const base = { message: error.message };
    if (error.code) base.code = error.code;
    if (error.details) base.details = error.details;
    return base;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "object") {
    return error;
  }

  return { message: String(error) };
};

function responseEnvelope(_req, res, next) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.success = (data = null, status = 200) => {
    if (status != null) {
      res.status(status);
    }
    return originalJson({ success: true, data, error: null });
  };

  res.fail = (status = 500, error = null) => {
    res.status(status);
    return originalJson({ success: false, data: null, error: normalizeError(error) });
  };

  res.json = (payload) => {
    if (
      payload &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "success") &&
      Object.prototype.hasOwnProperty.call(payload, "data") &&
      Object.prototype.hasOwnProperty.call(payload, "error")
    ) {
      return originalJson(payload);
    }

    const success = res.statusCode < 400;
    if (success) {
      return originalJson({ success: true, data: payload ?? null, error: null });
    }

    return originalJson({ success: false, data: null, error: normalizeError(payload) });
  };

  res.send = (payload) => {
    if (typeof payload === "object" && payload !== null) {
      return res.json(payload);
    }

    return originalSend(payload);
  };

  next();
}

module.exports = { responseEnvelope, normalizeError };
