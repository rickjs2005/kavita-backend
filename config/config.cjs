const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: "mysql",
    timezone: "-03:00",
    logging: false,
    dialectOptions: { multipleStatements: true },
  },

  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: "mysql",
    timezone: "-03:00",
    logging: false,
    dialectOptions: { multipleStatements: true },
  },
};