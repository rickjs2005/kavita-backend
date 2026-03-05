const speakeasy = require('speakeasy');

/**
 * Verify TOTP code
 * @param {string} secret - The shared secret for the TOTP
 * @param {string} token - The TOTP token to validate
 * @returns {boolean} - Returns true if the token is valid, otherwise false
 */
function verifyTOTP(secret, token) {
    const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
    });
    return verified;
}

module.exports = verifyTOTP;