"use strict";
// controllers/cepController.js
//
// Proxy publico de consulta de CEP.
//
// Motivacao: as paginas do frontend (checkout, enderecos do usuario,
// painel admin de frete) precisam consultar o ViaCEP para autocompletar
// endereco a partir do CEP. Chamar viacep.com.br direto do browser funciona
// em desenvolvimento mas quebra em producao nas rotas /admin/* porque o
// CSP do painel admin (next.config.ts) tem connect-src 'self' ${apiHosts}
// e viacep nao esta na lista — o fetch e bloqueado silenciosamente.
//
// A correcao correta e proxy no backend: o browser fala com o proprio
// backend do Kavita (ja permitido no CSP) e o backend fala com o ViaCEP.
// Padrao identico ao resto do projeto (frontend usa apiClient, backend
// usa fetch nativo do Node 18+ para APIs externas).
//
// Contrato:
//   GET /api/public/cep/:cep
//     :cep — 8 digitos (com ou sem mascara, o controller limpa)
//     200  — { ok: true, data: { cep, logradouro, bairro, localidade, uf } }
//     400  — CEP com formato invalido (nao 8 digitos)
//     404  — CEP nao encontrado no ViaCEP
//     503  — ViaCEP indisponivel / timeout

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const VIACEP_URL = "https://viacep.com.br/ws";
const TIMEOUT_MS = 5000;

function normalizeCep(raw) {
  return String(raw || "").replace(/\D/g, "").slice(0, 8);
}

const lookupCep = async (req, res, next) => {
  try {
    const digits = normalizeCep(req.params.cep);

    if (digits.length !== 8) {
      throw new AppError(
        "CEP invalido. Informe 8 digitos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let viacepRes;
    try {
      viacepRes = await fetch(`${VIACEP_URL}/${digits}/json/`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw new AppError(
        err.name === "AbortError"
          ? "Timeout ao consultar CEP."
          : "Servico de CEP indisponivel no momento.",
        ERROR_CODES.SERVER_ERROR,
        503,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!viacepRes.ok) {
      throw new AppError(
        "Servico de CEP retornou erro.",
        ERROR_CODES.SERVER_ERROR,
        503,
      );
    }

    const data = await viacepRes.json();

    // ViaCEP retorna { erro: true } quando nao encontra — HTTP 200 mesmo assim.
    if (data && data.erro) {
      throw new AppError(
        "CEP nao encontrado.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }

    // Normaliza — mantem o mesmo shape que o frontend ja consome
    // (CepResult em src/types/address.ts). Campos opcionais do ViaCEP
    // (complemento, gia, ibge, ddd, siafi) sao descartados.
    const payload = {
      cep: String(data.cep || "").trim(),
      logradouro: String(data.logradouro || "").trim(),
      bairro: String(data.bairro || "").trim(),
      localidade: String(data.localidade || "").trim(),
      uf: String(data.uf || "").trim(),
    };

    return response.ok(res, payload);
  } catch (err) {
    return next(err);
  }
};

module.exports = { lookupCep };
