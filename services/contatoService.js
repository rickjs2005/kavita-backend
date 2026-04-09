"use strict";
// services/contatoService.js
//
// Logica de negocio para mensagens de contato publico.
// Sanitiza entrada, aplica rate limit por IP e persiste.

const repo = require("../repositories/contatoRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { sanitizeText } = require("../utils/sanitize");

const MAX_PER_HOUR = 3;

/**
 * Cria uma nova mensagem de contato.
 * @returns {{ id: number }}
 */
async function createMensagem({ nome, email, telefone, assunto, mensagem, ip }) {
  // Rate limit por IP
  if (ip) {
    const count = await repo.countByIpSince(ip, 1);
    if (count >= MAX_PER_HOUR) {
      throw new AppError(
        "Limite de mensagens atingido. Tente novamente mais tarde.",
        ERROR_CODES.RATE_LIMIT,
        429
      );
    }
  }

  const { insertId } = await repo.create({
    nome: sanitizeText(nome, 150),
    email: sanitizeText(email, 255),
    telefone: telefone ? sanitizeText(telefone, 30) : "",
    assunto: sanitizeText(assunto, 200),
    mensagem: sanitizeText(mensagem, 5000),
    ip,
  });

  return { id: insertId };
}

module.exports = { createMensagem };
