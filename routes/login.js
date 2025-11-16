const express = require('express');
const createAdaptiveRateLimiter = require('../middleware/adaptiveRateLimiter');
const AuthController = require('../controllers/authController');

const router = express.Router();

const loginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : 'anon';
    return `login:${req.ip}:${email}`;
  },
});

router.post('/', loginRateLimiter, (req, res) => {
  if (!req.body.senha && req.body.password) {
    req.body.senha = req.body.password;
  }
  AuthController.login(req, res);
});

module.exports = router;
