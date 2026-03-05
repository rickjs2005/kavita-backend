const speakeasy = require('speakeasy');

/**
 * Verifies the TOTP token.
 *
 * @param {*} token - The TOTP token to verify.
 * @param {*} secret - The secret key used to generate the TOTP.
 * @returns {boolean} - Returns true if the token is valid, false otherwise.
 */
function verifyToken(token, secret) {
    return speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token
    });
}

module.exports = { verifyToken };