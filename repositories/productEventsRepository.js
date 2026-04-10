// repositories/productEventsRepository.js
//
// Acesso à tabela product_events. Única operação exposta é insert —
// leitura é feita por SQL ad-hoc ou por um endpoint admin futuro.
"use strict";

const pool = require("../config/pool");

async function insert({
  event,
  actor_type,
  actor_id,
  corretora_id,
  props,
  ip,
  user_agent,
}) {
  // MySQL2 aceita objeto JS diretamente em colunas JSON — ele serializa.
  // Fazemos JSON.stringify explícito para não depender disso e para ter
  // controle de tamanho (nunca deve crescer absurdo).
  const propsJson = props ? JSON.stringify(props).slice(0, 8000) : null;

  const [result] = await pool.query(
    `INSERT INTO product_events
       (event, actor_type, actor_id, corretora_id, props, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event,
      actor_type,
      actor_id ?? null,
      corretora_id ?? null,
      propsJson,
      ip ?? null,
      user_agent ?? null,
    ]
  );
  return result.insertId;
}

module.exports = { insert };
