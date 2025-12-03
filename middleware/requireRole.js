// middleware/requireRole.js

/**
 * Exemplo de uso:
 *   router.put('/pedidos/:id', verifyAdmin, requireRole(['master', 'gerente', 'suporte']), handler);
 *   router.delete('/produtos/:id', verifyAdmin, requireRole(['master', 'gerente']), handler);
 */
function requireRole(allowedRoles = []) {
  return function (req, res, next) {
    const role = req.admin?.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ message: 'Permissão insuficiente.' });
    }

    next();
  };
}

module.exports = requireRole;
