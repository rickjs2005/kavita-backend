require('dotenv').config();

const REQUIRED_VARS = [
  'JWT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'APP_URL',
  'BACKEND_URL',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
];

function ensureRequiredEnv() {
  const missing = REQUIRED_VARS.filter((key) =>
    typeof process.env[key] === 'undefined'
  );

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${missing.join(', ')}. ` +
        'Defina-as antes de iniciar a aplicação.'
    );
  }
}

ensureRequiredEnv();

const config = {
  appUrl: process.env.APP_URL,
  backendUrl: process.env.BACKEND_URL,
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '7d',
  },
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  },
};

module.exports = config;
