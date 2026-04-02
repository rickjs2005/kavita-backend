"use strict";
// controllers/userProfileController.js
//
// Extracts data from req, delegates to userProfileService, responds with lib/response.js.
// Consumers: routes/auth/userProfile.js
//
// Endpoints:
//   GET  /api/users/me          → getMe
//   PUT  /api/users/me          → updateMe
//   GET  /api/users/admin/:id   → getAdminUser
//   PUT  /api/users/admin/:id   → updateAdminUser

const { response } = require("../lib");
const service = require("../services/userProfileService");

// ---------------------------------------------------------------------------
// GET /api/users/me
// ---------------------------------------------------------------------------

const getMe = async (req, res, next) => {
  try {
    const data = await service.getProfile(req.user.id);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/users/me
// ---------------------------------------------------------------------------

const updateMe = async (req, res, next) => {
  try {
    const updated = await service.updateProfile(req.user.id, req.body);
    response.ok(res, updated);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/users/admin/:id
// ---------------------------------------------------------------------------

const getAdminUser = async (req, res, next) => {
  try {
    const data = await service.getProfileAdmin(req.params.id);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/users/admin/:id
// ---------------------------------------------------------------------------

const updateAdminUser = async (req, res, next) => {
  try {
    const updated = await service.updateProfileAdmin(req.params.id, req.body);
    response.ok(res, updated);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getMe,
  updateMe,
  getAdminUser,
  updateAdminUser,
};
