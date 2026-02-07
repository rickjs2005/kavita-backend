// middleware/authenticateToken.js
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");

module.exports = async function authenticateToken(req, res, next) {
  const SECRET = process.env.JWT_SECRET;

  let token = null;

  // 1) Cookie httpOnly
  if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  // 2) Authorization Bearer
  if (!token && req.headers.authorization) {
    const [type, value] = req.headers.authorization.split(" ");
    if (type === "Bearer") token = value;
  }

  if (!token) {
    return res.status(401).json({
      message: "Usuário não autenticado.",
    });
  }

  try {
    const payload = jwt.verify(token, SECRET);

    // Base do usuário (mínimo garantido)
    const userId = payload.id;

    if (!userId) {
      return res.status(401).json({ message: "Token inválido." });
    }

    // 🔥 BUSCA DIRETA NA TABELA CORRETA
    const [rows] = await pool.query(
      `
      SELECT id, nome, email
      FROM usuarios
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(401).json({
        message: "Usuário não encontrado.",
      });
    }

    const user = rows[0];

    // ✅ req.user COMPLETO E CONFIÁVEL
    req.user = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: payload.role || "user",
    };

    next();
  } catch (err) {
    console.error("authenticateToken error:", err.message);
    return res.status(401).json({
      message: "Sessão expirada. Faça login novamente.",
    });
  }
};
