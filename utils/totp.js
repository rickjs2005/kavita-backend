'use strict';

const speakeasy = require('speakeasy');

const totp = (secret) => {
    const token = speakeasy.totp({
        secret: secret,
    });
    return token;
};

module.exports = { totp };
