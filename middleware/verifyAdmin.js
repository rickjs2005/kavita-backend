const auth = require('../config/auth');

function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token não fornecido' });

  try {
    const decoded = auth.verify(token);
    req.admin = decoded;
    next();
  } catch (err) {
    req.log?.warn?.({ msg: 'JWT inválido/expirado', err: err.message });
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
}

module.exports = verifyAdmin;
