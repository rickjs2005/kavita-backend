const bcrypt = require('bcrypt'); // Biblioteca para criptografar e comparar senhas
const jwt = require('jsonwebtoken'); // Biblioteca para gerar e verificar tokens JWT
const pool = require('../config/pool'); // Importa a pool de conexões com o banco de dados

const AuthController = {
  // Função de login do usuário
  async login(req, res) {
    const { email, senha } = req.body; // Recebe email e senha do corpo da requisição

    try {
      // Verifica se o usuário existe no banco pelo e-mail
      const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(400).json({ message: 'Usuário não encontrado.' });
      }

      const user = users[0]; // Usuário encontrado

      // Compara a senha informada com a senha criptografada no banco
      const isPasswordValid = await bcrypt.compare(senha, user.senha);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Credenciais inválidas.' });
      }

      // Gera um token JWT com ID do usuário e validade de 1 hora
      const token = jwt.sign({ id: user.id }, 'sua_chave_secreta', { expiresIn: '1h' });

      // Retorna token e dados básicos do usuário
      res.status(200).json({
        message: 'Login bem-sucedido!',
        token,
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
        },
      });
    } catch (error) {
      console.error('Erro no login:', error);
      res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
    }
  },

  // Função de registro/cadastro de novo usuário
  async register(req, res) {
    const { nome, email, senha } = req.body; // Recebe nome, email e senha do corpo da requisição

    try {
      // Verifica se o e-mail já está cadastrado
      const [users] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);

      if (users.length > 0) {
        return res.status(400).json({ message: 'Este email já está cadastrado.' });
      }

      // Criptografa a senha antes de salvar no banco
      const hashedPassword = await bcrypt.hash(senha, 10);

      // Insere o novo usuário no banco com senha criptografada
      const [result] = await pool.query(
        'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
        [nome, email, hashedPassword]
      );

      // Responde com sucesso
      res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (error) {
      console.error('Erro no registro:', error);
      res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
    }
  },

  // Função de logout (apenas simbólica, já que JWT é controlado no frontend)
  async logout(req, res) {
    // Aqui seria possível invalidar o token se usasse blacklist (não implementado)
    res.status(200).json({ message: 'Logout bem-sucedido!' });
  },
};

module.exports = AuthController; // Exporta o objeto para ser usado em rotas
