// controllers/public/publicPrivacyContactController.js
//
// Canal público do DPO (Fase 10.3). Reusa o contatoService existente
// mas força o assunto para "privacidade:<tipo>" — facilita filtragem
// por assunto no admin e permite retenção específica (ver
// docs/compliance/retencao.md).
"use strict";

const { z } = require("zod");

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const contatoService = require("../../services/contatoService");
const logger = require("../../lib/logger");

const privacyContactSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(150, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .max(255),
  telefone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  tipo: z.enum(
    [
      "acesso",
      "correcao",
      "exclusao",
      "portabilidade",
      "duvida",
      "incidente",
      "outro",
    ],
    {
      errorMap: () => ({
        message:
          "Selecione o tipo (acesso, correcao, exclusao, portabilidade, duvida, incidente, outro).",
      }),
    },
  ),
  mensagem: z
    .string()
    .trim()
    .min(10, "Conte-nos o que você precisa (mínimo 10 caracteres).")
    .max(5000),
});

async function sendPrivacyContact(req, res, next) {
  try {
    const parsed = privacyContactSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      throw new AppError(
        "Dados inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { fields },
      );
    }

    const { nome, email, telefone, tipo, mensagem } = parsed.data;
    const assunto = `privacidade:${tipo}`;

    const result = await contatoService.createMensagem({
      nome,
      email,
      telefone: telefone || "",
      assunto,
      mensagem,
      ip: req.ip,
    });

    logger.info(
      { privacyTipo: tipo, mensagemId: result?.id },
      "privacy.public_channel.message_received",
    );

    return response.created(
      res,
      { received: true },
      "Pedido registrado. Responderemos no prazo legal.",
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar sua solicitação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { sendPrivacyContact };
