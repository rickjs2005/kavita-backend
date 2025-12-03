// middleware/requirePermission.js

/**
 * Exemplo:
 *   router.get('/admin/produtos', verifyAdmin, requirePermission('produtos.ver'), handler);
 *   router.put('/admin/produtos/:id', verifyAdmin, requirePermission('produtos.editar'), handler);
 */
function requirePermission(permissionKey) {
  return function (req, res, next) {
    const perms = req.admin?.permissions || [];

    if (!perms.includes(permissionKey)) {
      return res.status(403).json({
        message: "Permissão insuficiente.",
        required: permissionKey,
      });
    }

    next();
  };
}

module.exports = requirePermission;
