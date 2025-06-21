const express = require("express");       // Framework web para criar servidor e rotas HTTP
const cors = require("cors");             // Middleware que permite requisições entre domínios diferentes (CORS)
const bcrypt = require("bcrypt");         // Biblioteca para criptografar e comparar senhas
const pool = require("./config/pool");    // Conexão com o banco de dados MySQL
require("dotenv").config();               // Carrega variáveis de ambiente do arquivo .env

const app = express(); // Inicializa o aplicativo Express

/* ---------------------------------------- */
/* 🛡️ MIDDLEWARES GLOBAIS                   */
/* ---------------------------------------- */
app.use(cors({
  origin: "http://localhost:3000", // Permite requisições do frontend local
  credentials: true,              // Permite envio de cookies/cabecalhos de autenticação
}));
app.use(express.json()); // Permite que o servidor leia JSON no corpo das requisições

/* ---------------------------------------- */
/* 🔓 LOGIN DE USUÁRIO (CLIENTE)            */
/* ---------------------------------------- */
// Função auxiliar que valida login do usuário comum
const loginUser = async (email, password) => {
  const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);
  if (rows.length === 0) throw new Error("Usuário não encontrado.");

  const user = rows[0];
  const isValid = await bcrypt.compare(password, user.senha); // Compara senha informada com a criptografada
  if (!isValid) throw new Error("Credenciais inválidas.");

  return {
    message: "Login bem-sucedido!",
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
    },
  };
};

// Rota POST para login de usuário comum (cliente)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await loginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    console.error("Erro no login:", error.message);
    res.status(401).json({ message: error.message });
  }
});

/* ---------------------------------------- */
/* 🛠️ ROTAS ADMINISTRATIVAS                */
/* ---------------------------------------- */
app.use("/api/admin", require("./routes/adminLogin"));
app.use("/api/admin/produtos", require("./routes/adminProdutos"));
app.use("/api/admin/categorias", require("./routes/adminCategorias"));
app.use("/api/admin/servicos", require("./routes/adminServicos"));
app.use("/api/admin/colaboradores", require("./routes/adminColaboradores"));
app.use("/api/admin/especialidades", require("./routes/adminEspecialidades"));
app.use("/api/admin/destaques", require("./routes/adminDestaques"));
app.use("/api/admin/pedidos", require("./routes/adminPedidos"));

/* ---------------------------------------- */
/* 🌐 ROTAS PÚBLICAS                        */
/* ---------------------------------------- */
app.use("/api/products", require("./routes/products"));               // Produtos por categoria/ID
app.use("/api/users", require("./routes/users"));                     // Cadastro e recuperação de senha
app.use("/api/checkout", require("./routes/checkoutRoutes"));         // Checkout de pedidos
app.use("/api/public/servicos", require("./routes/publicServicos")); // Lista pública de colaboradores
app.use("/api/public/destaques", require("./routes/publicDestaques"));// Lista pública de produtos em destaque
app.use("/api/public/produtos", require("./routes/publicProdutos")); // Busca rápida para SearchBar

/* ---------------------------------------- */
/* ❌ TRATAMENTO GLOBAL DE ERROS            */
/* ---------------------------------------- */
// Captura erros não tratados em qualquer rota e retorna erro padronizado
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({ message: "Erro interno no servidor" });
});

/* ---------------------------------------- */
/* 🚀 INICIALIZAÇÃO DO SERVIDOR             */
/* ---------------------------------------- */
const PORT = process.env.PORT || 5000; // Usa a porta do .env ou 5000 por padrão

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
