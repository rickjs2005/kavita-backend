// middleware/authenticateToken.js
const authConfig = require("../config/auth");
const pool = require("../config/pool");

module.exports = async function authenticateToken(req, res, next) {
  // Cookie-only authentication — Bearer tokens are not accepted
  const token = req.cookies?.auth_token || null;

  if (!token) {
    return res.status(401).json({ message: "Usuário não autenticado." });
  }

  try {
    const payload = authConfig.verify(token);

    const userId = payload?.id;
    if (!userId) {
      return res.status(401).json({ message: "Token inválido." });
    }

    const [rows] = await pool.query(
      `
      SELECT id, nome, email, tokenVersion
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

    // Validate tokenVersion to support logout revocation
    if (
      user.tokenVersion != null &&
      payload.tokenVersion != null &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({ message: "Sessão inválida. Faça login novamente." });
    }

    req.user = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: payload.role || "user",
    };

    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";
    console.error("authenticateToken error:", err?.message);

    return res.status(401).json({
      message: isExpired
        ? "Sessão expirada. Faça login novamente."
        : "Token inválido.",
    });
  }
};