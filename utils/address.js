const REQUIRED_FIELDS = [
  "cep",
  "rua",
  "numero",
  "bairro",
  "cidade",
  "estado",
];

function sanitizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeState(value) {
  const sanitized = sanitizeString(value).toUpperCase();
  if (!sanitized) return "";
  if (sanitized.length === 2) return sanitized;
  return sanitized.slice(0, 2);
}

function normalizeCep(value) {
  const digits = sanitizeString(value).replace(/\D/g, "");
  return digits.slice(0, 8);
}

function normalizeAddressInput(address = {}) {
  const normalized = {
    cep: normalizeCep(address.cep),
    rua: sanitizeString(address.rua),
    numero: sanitizeString(address.numero),
    bairro: sanitizeString(address.bairro),
    cidade: sanitizeString(address.cidade),
    estado: normalizeState(address.estado),
    complemento: sanitizeString(address.complemento || ""),
  };

  if (!normalized.complemento) normalized.complemento = null;
  return normalized;
}

function validateAddress(address) {
  for (const field of REQUIRED_FIELDS) {
    if (!address[field]) {
      throw new Error(`Campo de endereço "${field}" é obrigatório.`);
    }
  }
  if (address.cep.length !== 8) {
    throw new Error("CEP deve conter 8 dígitos.");
  }
}

function serializeAddress(address) {
  const normalized = normalizeAddressInput(address);
  validateAddress(normalized);
  return JSON.stringify(normalized);
}

function parseLegacyAddressString(raw) {
  if (!raw) return null;
  let working = raw.trim();
  if (!working) return null;

  const result = {
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    complemento: null,
  };

  const cepMatch = working.match(/cep[:\s]*([\d-]+)/i);
  if (cepMatch) {
    result.cep = cepMatch[1].replace(/\D/g, "");
    working = working.replace(cepMatch[0], "");
  }

  const complementoMatch = working.match(/\(([^)]+)\)\s*$/);
  if (complementoMatch) {
    result.complemento = complementoMatch[1].trim() || null;
    working = working.replace(complementoMatch[0], "");
  }

  const parts = working
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const [streetPart, bairroPart, cityStatePart] = parts;

    const [street, numero] = streetPart.split(",").map((p) => p.trim());
    result.rua = street || streetPart;
    result.numero = numero || "";

    result.bairro = bairroPart.replace(/\.$/, "");

    const cityStatePieces = cityStatePart.split(/[,\s]+/).filter(Boolean);
    if (cityStatePieces.length) {
      result.estado = cityStatePieces.pop() || "";
      result.cidade = cityStatePieces.join(" ");
    } else {
      result.cidade = cityStatePart;
    }
  } else {
    const [street, numero] = working.split(",").map((p) => p.trim());
    result.rua = street || working;
    result.numero = numero || "";
  }

  return normalizeAddressInput(result);
}

function parseAddress(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return normalizeAddressInput(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return normalizeAddressInput(parsed);
    }
  } catch (_) {
    // ignore JSON parse errors – fallback to legacy parser
  }

  return parseLegacyAddressString(trimmed);
}

module.exports = {
  normalizeAddressInput,
  serializeAddress,
  parseAddress,
};
