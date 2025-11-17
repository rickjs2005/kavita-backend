// middleware/authenticateToken.js
const jwt = require("jsonwebtoken");

/**
 * Middleware de autenticação com JWT.
 * Espera header: Authorization: Bearer <token>
 * Se o token for válido, preenche req.user = payload e chama next().
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Formato de token inválido." });
  }

  try {
    // Usa o mesmo segredo que você já usa no authConfig e nos testes
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // payload deve ter pelo menos { id: user.id }
    req.user = payload;
    return next();
  } catch (error) {
    console.error("Erro ao verificar token JWT:", error);
    return res.status(403).json({ message: "Token inválido ou expirado." });
  }
}

module.exports = authenticateToken;
