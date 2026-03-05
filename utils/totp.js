const speakeasy = require("speakeasy");

function verifyToken(token, secret) {
    return speakeasy.totp.verify({ secret: secret, encoding: "base32", token: token });
}

module.exports = { verifyToken };