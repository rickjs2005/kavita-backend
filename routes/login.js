const express = require("express");
const createAdaptiveRateLimiter = require("../middleware/adaptiveRateLimiter");
const AuthController = require("../controllers/authController");
const { loginValidators } = require("../validators/authValidator");

const router = express.Router();

const loginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : "anon";
    return `login:${req.ip}:${email}`;
  },
});

// IMPORTANTE: sempre passar next
router.post("/", loginRateLimiter, loginValidators, (req, res, next) => {
  if (!req.body.senha && req.body.password) {
    req.body.senha = req.body.password;
  }

  // deixa o controller cuidar de tudo (inclusive erros)
  return AuthController.login(req, res, next);
});

module.exports = router;
