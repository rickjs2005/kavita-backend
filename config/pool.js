require("dotenv").config();
const mysql = require("mysql2/promise");

// Cria a conexão com base nas variáveis de ambiente
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kavita",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
