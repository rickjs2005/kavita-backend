// middleware/authenticateToken.js
const authConfig = require("../config/auth");
const pool = require("../config/pool");

module.exports = async function authenticateToken(req, res, next) {
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
    return res.status(401).json({ message: "Usuário não autenticado." });
  }

  try {
    // ✅ usa a mesma config (secret) do authConfig
    const payload = authConfig.verify(token);

    const userId = payload?.id;
    if (!userId) {
      return res.status(401).json({ message: "Token inválido." });
    }

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
      return res.status(401).json({ message: "Usuário não encontrado." });
    }

    const user = rows[0];

    req.user = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: payload.role || "user",
    };

    return next();
  } catch (err) {
    // ✅ diferencia expirado vs inválido (melhor UX e debug)
    const isExpired = err?.name === "TokenExpiredError";
    console.error("authenticateToken error:", err?.message);

    return res.status(401).json({
      message: isExpired
        ? "Sessão expirada. Faça login novamente."
        : "Token inválido.",
    });
  }
};