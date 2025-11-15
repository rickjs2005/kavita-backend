const crypto = require('crypto');

let bcrypt;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  bcrypt = require('bcryptjs');
} catch (err) {
  bcrypt = null;
}

async function hash(value, saltRounds = 10) {
  if (bcrypt?.hash) {
    return bcrypt.hash(value, saltRounds);
  }
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function compare(plain, hashed) {
  if (bcrypt?.compare) {
    return bcrypt.compare(plain, hashed);
  }
  const derived = await hash(plain);
  return derived === hashed;
}

module.exports = { hash, compare };
