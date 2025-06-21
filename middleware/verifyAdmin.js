require("dotenv").config(); // Carrega variáveis de ambiente do arquivo .env
const jwt = require("jsonwebtoken"); // Biblioteca para manipular tokens JWT

// Pega a chave secreta usada para assinar/verificar o token JWT
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware para verificar se o token do admin é válido
function verifyAdmin(req, res, next) {
  // Extrai o token do cabeçalho Authorization (formato esperado: "Bearer TOKEN")
  const token = req.headers.authorization?.split(" ")[1];

  // Se não houver token, retorna erro 401 (não autorizado)
  if (!token) return res.status(401).json({ message: "Token não fornecido" });

  try {
    // Verifica se o token é válido e decodifica as informações dentro dele
    const decoded = jwt.verify(token, SECRET_KEY);

    // Salva as informações decodificadas (ex: id do admin) na requisição
    req.admin = decoded;

    // Permite que a requisição continue para a próxima função
    next();
  } catch (err) {
    // Se o token for inválido ou expirado, retorna erro 401
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
}

module.exports = verifyAdmin; // Exporta o middleware para uso nas rotas protegidas