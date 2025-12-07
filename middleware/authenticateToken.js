// middleware/authenticateToken.js
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação com JWT.
 *
 * Estratégia:
 * - Primeiro tenta ler o token do cookie HttpOnly: auth_token
 * - Caso não exista, aceita Authorization: Bearer <token> (compatibilidade)
 * - Se o token for válido, preenche req.user = payload e chama next().
 */
function authenticateToken(req, res, next) {
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    console.error('JWT_SECRET não definido no .env');
    return res
      .status(500)
      .json({ message: 'Erro de configuração de autenticação.' });
  }

  let token = null;

  // 1) Tenta pegar do cookie HttpOnly (via cookie-parser)
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  // 2) Fallback: Authorization: Bearer <token>
  if (!token) {
    const authHeader = req.headers['authorization'] || req.headers.authorization;

    if (authHeader && typeof authHeader === 'string') {
      const [scheme, value] = authHeader.split(' ');
      if (scheme === 'Bearer' && value) {
        token = value;
      }
    }
  }

  if (!token) {
    // Log detalhado no servidor
    console.warn('authenticateToken: token ausente na requisição');
    return res.status(401).json({
      message: 'Você precisa estar logado para acessar esta área.',
    });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    // Exemplo de payload esperado: { id: 123, role?: '...' , iat, exp }
    req.user = {
      id: payload.id,
      role: payload.role || null,
      // Se quiser preservar tudo:
      // ...payload,
    };

    return next();
  } catch (error) {
    console.error('authenticateToken: falha ao verificar token JWT:', error);
    return res.status(401).json({
      message: 'Sua sessão expirou ou é inválida. Faça login novamente.',
    });
  }
}

module.exports = authenticateToken;
