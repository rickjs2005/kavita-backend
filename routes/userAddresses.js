// routes/userAddresses.js
const express = require('express');
const router = express.Router();
const pool = require('../config/pool');
const authenticateToken = require('../middleware/authenticateToken');

router.use(authenticateToken);

// Lista endereços do usuário (padrão primeiro)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM enderecos_usuario WHERE usuario_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error('Erro ao listar endereços:', e);
    res.status(500).json({ message: 'Erro ao listar endereços' });
  }
});

// Cria novo endereço
router.post('/', async (req, res) => {
  const {
    apelido,
    cep,
    endereco,
    numero,
    bairro,
    cidade,
    estado,
    complemento,
    ponto_referencia,
    telefone,
    is_default,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // se marcar como padrão, remove padrão anterior
    if (is_default) {
      await conn.query(
        'UPDATE enderecos_usuario SET is_default = 0 WHERE usuario_id = ?',
        [req.user.id]
      );
    }

    // ⚠️ AQUI estava o bug: 12 colunas, então 12 "?" e 12 valores
    const [result] = await conn.query(
      `INSERT INTO enderecos_usuario (
         usuario_id,
         apelido,
         cep,
         endereco,
         numero,
         bairro,
         cidade,
         estado,
         complemento,
         ponto_referencia,
         telefone,
         is_default
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        apelido,
        cep,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        complemento,
        ponto_referencia,
        telefone,
        is_default ? 1 : 0,
      ]
    );

    await conn.commit();
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error('Erro ao adicionar endereço:', e);
    await conn.rollback();
    res.status(500).json({ message: 'Erro ao adicionar endereço' });
  } finally {
    conn.release();
  }
});

// Atualiza endereço
router.put('/:id', async (req, res) => {
  const {
    apelido,
    cep,
    endereco,
    numero,
    bairro,
    cidade,
    estado,
    complemento,
    ponto_referencia,
    telefone,
    is_default,
  } = req.body;
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (is_default) {
      await conn.query(
        'UPDATE enderecos_usuario SET is_default = 0 WHERE usuario_id = ?',
        [req.user.id]
      );
    }

    await conn.query(
      `UPDATE enderecos_usuario
         SET apelido = ?,
             cep = ?,
             endereco = ?,
             numero = ?,
             bairro = ?,
             cidade = ?,
             estado = ?,
             complemento = ?,
             ponto_referencia = ?,
             telefone = ?,
             is_default = ?
       WHERE id = ? AND usuario_id = ?`,
      [
        apelido,
        cep,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        complemento,
        ponto_referencia,
        telefone,
        is_default ? 1 : 0,
        id,
        req.user.id,
      ]
    );

    await conn.commit();
    res.json({ message: 'Endereço atualizado' });
  } catch (e) {
    console.error('Erro ao atualizar endereço:', e);
    await conn.rollback();
    res.status(500).json({ message: 'Erro ao atualizar endereço' });
  } finally {
    conn.release();
  }
});

// Remove endereço
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM enderecos_usuario WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Endereço removido' });
  } catch (e) {
    console.error('Erro ao remover endereço:', e);
    res.status(500).json({ message: 'Erro ao remover endereço' });
  }
});

module.exports = router;
