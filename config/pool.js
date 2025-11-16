const mysql = require('mysql2/promise');
const { db } = require('./env');

const pool = mysql.createPool({
  host: db.host,
  user: db.user,
  password: db.password,
  database: db.database,
  port: db.port,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
