// routes/public/publicContratoVerificacao.js
//
// Rota pública que valida o QR Code impresso no rodapé do contrato.
// Sem auth, sem CSRF — leitura aberta. Retorna projeção segura.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/public/contratoVerificacaoController");

router.get("/:token", ctrl.verificar);

module.exports = router;
