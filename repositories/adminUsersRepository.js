"use strict";
// repositories/adminUsersRepository.js
//
// Escopo: gestão admin de USUARIOS (listar, bloquear, excluir).
// Não confundir com userRepository.js (auth + perfil do próprio usuário).
//
// Consumidor: controllers/adminUsersController.js

const pool = require("../config/pool");
const { decryptCPF } = require("../utils/cpfCrypto");

const USER_FIELDS =
  "id, nome, email, telefone, cpf, endereco, cidade, estado, cep, pais, ponto_referencia, status_conta, criado_em";

async function findAll() {
  const [rows] = await pool.query(
    `SELECT ${USER_FIELDS} FROM usuarios ORDER BY criado_em DESC`
  );
  return rows.map((r) => ({ ...r, cpf: decryptCPF(r.cpf) }));
}

async function updateStatusConta(id, statusConta) {
  const [result] = await pool.query(
    "UPDATE usuarios SET status_conta = ? WHERE id = ?",
    [statusConta, id]
  );
  return result.affectedRows;
}

async function deleteById(id) {
  const [result] = await pool.query(
    "DELETE FROM usuarios WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

module.exports = { findAll, updateStatusConta, deleteById };
