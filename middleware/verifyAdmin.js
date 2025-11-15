// middleware/verifyAdmin.js
require("dotenv").config();
const { requireAdmin } = require("./common/auth");

module.exports = requireAdmin();
