// routes/admin/adminLogin.js
const express = require("express");
const router = express.Router();
const verifyAdmin = require("../../middleware/verifyAdmin");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const { ADMIN_LOGIN_SCHEDULE } = require("../../config/rateLimitSchedules");
const {
  login,
  loginMfa,
  getMe,
  logout,
} = require("../../controllers/admin/authAdminController");

const adminLoginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email =
      req.body?.email
        ? String(req.body.email).trim().toLowerCase()
        : "anon";
    return `admin_login:${req.ip}:${email}`;
  },
  schedule: ADMIN_LOGIN_SCHEDULE,
});

const mfaRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const challengeId =
      req.body?.challengeId
        ? String(req.body.challengeId).slice(0, 64)
        : "anon";
    return `admin_mfa:${req.ip}:${challengeId}`;
  },
  schedule: ADMIN_LOGIN_SCHEDULE,
});

router.post("/login", adminLoginRateLimiter, login);
router.post("/login/mfa", mfaRateLimiter, loginMfa);
router.get("/me", verifyAdmin, getMe);
router.post("/logout", adminLoginRateLimiter, verifyAdmin, logout);

module.exports = router;
