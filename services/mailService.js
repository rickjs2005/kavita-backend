const nodemailer = require('nodemailer'); // Biblioteca para envio de e-mails via SMTP

// Função assíncrona que envia o e-mail de redefinição de senha
async function sendResetPasswordEmail(toEmail, token) {
  // 🔗 Monta o link de redefinição com o token recebido
  // Esse link será clicado pelo usuário para criar uma nova senha
  const resetLink = `http://localhost:3000/reset-password?token=${token}`;

  // 🔐 Configura o transporte de e-mail com as credenciais do .env
  const transporter = nodemailer.createTransport({
    service: 'Gmail', // Pode ser trocado por outro serviço SMTP
    auth: {
      user: process.env.EMAIL_USER, // E-mail remetente
      pass: process.env.EMAIL_PASS  // Senha do e-mail remetente
    }
  });

  // 📤 Envia o e-mail para o destinatário com o link
  await transporter.sendMail({
    from: '"Suporte" <suporte@kavita.com>', // Nome do remetente
    to: toEmail,                             // E-mail do usuário que solicitou
    subject: 'Redefinição de Senha',         // Assunto do e-mail
    html: `                                  // Corpo do e-mail em HTML
      <p>Você solicitou a redefinição de senha.</p>
      <p>Clique no link para criar uma nova senha: 
         <a href="${resetLink}">${resetLink}</a>
      </p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `
  });
}

module.exports = { sendResetPasswordEmail }; // Exporta a função para ser usada em outras partes da aplicação
