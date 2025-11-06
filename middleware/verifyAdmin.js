// middleware/verifyAdmin.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET;

function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token não fornecido" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.admin = decoded;
    next();
  } catch (err) {
    req.log?.warn({ msg: "JWT inválido/expirado", err: err.message }); // NEW (opcional)
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
}
module.exports = verifyAdmin;
