const pool = require('../config/pool');

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
  return rows[0] || null;
}

async function createUser({ nome, email, senha }) {
  const [result] = await pool.query(
    'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
    [nome, email, senha]
  );
  return result.insertId;
}

async function updateResetToken(userId, token, expiresAt) {
  await pool.execute(
    'UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE id = ?',
    [token, expiresAt, userId]
  );
}

async function findByResetToken(token) {
  const [rows] = await pool.execute(
    'SELECT id, email, nome FROM usuarios WHERE resetToken = ? AND resetTokenExpires > NOW()',
    [token]
  );
  return rows[0] || null;
}

async function updatePasswordAndClearReset(userId, hashedPassword) {
  await pool.execute(
    'UPDATE usuarios SET senha = ?, resetToken = NULL, resetTokenExpires = NULL WHERE id = ?',
    [hashedPassword, userId]
  );
}

module.exports = {
  findByEmail,
  createUser,
  updateResetToken,
  findByResetToken,
  updatePasswordAndClearReset,
};
