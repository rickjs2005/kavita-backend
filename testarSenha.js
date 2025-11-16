const bcrypt = require('bcrypt');

const senhaDigitada = 'admin123'; // senha que você está tentando usar
const senhaNoBanco = '$2b$10$DzRWmfsoobgGdCncnuMchuLoC0/QPJAH59AwYPNZqRueV6l/MuJAi'; // a que você colocou no banco

bcrypt.compare(senhaDigitada, senhaNoBanco)
  .then(result => {
    console.log("Senha confere?", result); // true ou false
  })
  .catch(err => console.error(err));
