const mysql = require("mysql2/promise");
const { db } = require("./env");

const pool = mysql.createPool({
  host: db.host,
  user: db.user,
  password: db.password,
  database: db.database,
  port: db.port,

  // ✅ desempenho/estabilidade
  waitForConnections: true,   // ao invés de falhar, espera vaga no pool
  connectionLimit: 10,        // ajuste conforme carga (CI/dev ok)
  queueLimit: 0,              // fila ilimitada (cuidado em overload)
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // ✅ timeouts (evita “pendurar”)
  connectTimeout: 10_000,
});

module.exports = pool;