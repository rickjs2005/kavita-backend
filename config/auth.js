const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('./env');

function sign(payload, options = {}) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    ...options,
  });
}

function verify(token, options = {}) {
  return jwt.verify(token, jwtConfig.secret, options);
}

module.exports = {
  secret: jwtConfig.secret,
  expiresIn: jwtConfig.expiresIn,
  sign,
  verify,
};
