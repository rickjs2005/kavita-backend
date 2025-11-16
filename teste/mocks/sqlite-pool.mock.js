function createInitialState() {
  return {
    tables: {
      categories: [],
      products: [],
      product_images: [],
      usuarios: [],
      pedidos: [],
      pedidos_produtos: [],
    },
    nextIds: {
      categories: 1,
      products: 1,
      product_images: 1,
      usuarios: 1,
      pedidos: 1,
      pedidos_produtos: 1,
    },
  };
}

let state = createInitialState();

function cloneState(source) {
  return {
    tables: JSON.parse(JSON.stringify(source.tables)),
    nextIds: { ...source.nextIds },
  };
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function respondRows(rows) {
  return Promise.resolve([cloneRows(rows), []]);
}

function respondResult(result) {
  return Promise.resolve([{ insertId: result.insertId || 0, affectedRows: result.affectedRows || 0, changedRows: result.changedRows || result.affectedRows || 0 }, []]);
}

function handleInsertCategories(currentState, params) {
  const [name, slug] = params;
  const id = currentState.nextIds.categories++;
  currentState.tables.categories.push({ id, name, slug });
  return respondResult({ insertId: id, affectedRows: 1 });
}

function handleInsertProducts(currentState, params) {
  const [category_id, name, description, price, quantity] = params;
  const id = currentState.nextIds.products++;
  const now = new Date().toISOString();
  currentState.tables.products.push({
    id,
    category_id,
    name,
    description,
    price: Number(price),
    quantity: Number(quantity),
    image: null,
    created_at: now,
    updated_at: now,
  });
  return respondResult({ insertId: id, affectedRows: 1 });
}

function handleInsertUsuarios(currentState, params) {
  const [nome, email] = params;
  const id = currentState.nextIds.usuarios++;
  currentState.tables.usuarios.push({ id, nome, email });
  return respondResult({ insertId: id, affectedRows: 1 });
}

function handleSelectUsuarioById(currentState, params) {
  const [id] = params;
  const row = currentState.tables.usuarios.find((u) => u.id === Number(id));
  return respondRows(row ? [row] : []);
}

function handleSelectProductsByIds(currentState, params) {
  const ids = params.map((id) => Number(id));
  const rows = currentState.tables.products.filter((p) => ids.includes(p.id));
  return respondRows(rows.map(({ id, name, quantity, price }) => ({ id, name, quantity, price })));
}

function handleSelectProductQuantity(currentState, params) {
  const [id] = params;
  const row = currentState.tables.products.find((p) => p.id === Number(id));
  if (!row) return respondRows([]);
  return respondRows([{ quantity: row.quantity }]);
}

function handleUpdateProductQuantity(currentState, params) {
  const [delta, id] = params;
  const product = currentState.tables.products.find((p) => p.id === Number(id));
  if (!product) return respondResult({ affectedRows: 0, changedRows: 0 });
  product.quantity = Number(product.quantity) - Number(delta);
  product.updated_at = new Date().toISOString();
  return respondResult({ affectedRows: 1, changedRows: 1 });
}

function handleInsertPedido(currentState, params) {
  const [usuario_id, endereco, forma_pagamento, total] = params;
  const id = currentState.nextIds.pedidos++;
  currentState.tables.pedidos.push({
    id,
    usuario_id,
    endereco,
    forma_pagamento,
    status: 'pendente',
    total: Number(total),
    data_pedido: new Date().toISOString(),
  });
  return respondResult({ insertId: id, affectedRows: 1 });
}

function handleInsertPedidoProduto(currentState, params) {
  const [pedido_id, produto_id, quantidade, valor_unitario] = params;
  const id = currentState.nextIds.pedidos_produtos++;
  currentState.tables.pedidos_produtos.push({
    id,
    pedido_id: Number(pedido_id),
    produto_id: Number(produto_id),
    quantidade: Number(quantidade),
    valor_unitario: Number(valor_unitario),
  });
  return respondResult({ insertId: id, affectedRows: 1 });
}

function handleSelectPedidos(currentState) {
  return respondRows(currentState.tables.pedidos);
}

function handleSelectPedidosResumo(currentState, params) {
  const [maybeUsuarioId] = params || [];
  const pedidos = currentState.tables.pedidos.filter((pedido) => {
    if (params.length === 0) return true;
    return pedido.usuario_id === Number(maybeUsuarioId);
  });

  const rows = pedidos.map((pedido) => {
    const itens = currentState.tables.pedidos_produtos.filter((item) => item.pedido_id === pedido.id);
    const total = itens.reduce((sum, item) => sum + item.quantidade * item.valor_unitario, 0);
    return {
      id: pedido.id,
      usuario_id: pedido.usuario_id,
      forma_pagamento: pedido.forma_pagamento,
      status: pedido.status,
      data_pedido: pedido.data_pedido,
      total,
    };
  });
  rows.sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido));
  return respondRows(rows);
}

function handleSelectPedidoById(currentState, params) {
  const [id] = params;
  const row = currentState.tables.pedidos.find((p) => p.id === Number(id));
  return respondRows(row ? [row] : []);
}

function handleSelectItensByPedido(currentState, params) {
  const [pedidoId] = params;
  const itens = currentState.tables.pedidos_produtos
    .filter((item) => item.pedido_id === Number(pedidoId))
    .map((item) => {
      const product = currentState.tables.products.find((p) => p.id === item.produto_id) || {};
      return {
        id: product.id,
        name: product.name,
        valor_unitario: item.valor_unitario,
        quantidade: item.quantidade,
      };
    });
  return respondRows(itens);
}

function handleAdminPedidos(currentState) {
  const rows = currentState.tables.pedidos.map((pedido) => {
    const usuario = currentState.tables.usuarios.find((u) => u.id === pedido.usuario_id);
    const itens = currentState.tables.pedidos_produtos.filter((i) => i.pedido_id === pedido.id);
    return {
      pedido_id: pedido.id,
      usuario_nome: usuario ? usuario.nome : null,
      endereco: pedido.endereco,
      forma_pagamento: pedido.forma_pagamento,
      status: pedido.status,
      total: pedido.total,
      data_pedido: pedido.data_pedido,
    };
  });
  rows.sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido));
  return respondRows(rows);
}

function handleAdminPedidoItens(currentState) {
  const rows = currentState.tables.pedidos_produtos.map((item) => {
    const product = currentState.tables.products.find((p) => p.id === item.produto_id) || {};
    return {
      pedido_id: item.pedido_id,
      produto_nome: product.name,
      quantidade: item.quantidade,
      preco_unitario: item.valor_unitario,
    };
  });
  return respondRows(rows);
}

function handleDeletePedidoItens(currentState, params) {
  const [pedidoId] = params;
  const before = currentState.tables.pedidos_produtos.length;
  currentState.tables.pedidos_produtos = currentState.tables.pedidos_produtos.filter(
    (item) => item.pedido_id !== Number(pedidoId)
  );
  const removed = before - currentState.tables.pedidos_produtos.length;
  return respondResult({ affectedRows: removed, changedRows: removed });
}

function handleUpdatePedidoTotal(currentState, params) {
  const [total, id] = params;
  const pedido = currentState.tables.pedidos.find((p) => p.id === Number(id));
  if (!pedido) return respondResult({ affectedRows: 0 });
  pedido.total = Number(total);
  return respondResult({ affectedRows: 1 });
}

function handleUpdatePedidoEndereco(currentState, params) {
  const [endereco, id] = params;
  const pedido = currentState.tables.pedidos.find((p) => p.id === Number(id));
  if (!pedido) return respondResult({ affectedRows: 0 });
  pedido.endereco = endereco;
  return respondResult({ affectedRows: 1 });
}

function runQuery(currentState, sql, params = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  if (normalized.startsWith('INSERT INTO CATEGORIES')) {
    return handleInsertCategories(currentState, params);
  }
  if (normalized.startsWith('INSERT INTO PRODUCTS')) {
    return handleInsertProducts(currentState, params);
  }
  if (normalized.startsWith('INSERT INTO USUARIOS')) {
    return handleInsertUsuarios(currentState, params);
  }
  if (normalized.startsWith('SELECT ID FROM USUARIOS WHERE ID =')) {
    return handleSelectUsuarioById(currentState, params);
  }
  if (normalized.startsWith('SELECT ID, NAME, QUANTITY, PRICE FROM PRODUCTS WHERE ID IN')) {
    return handleSelectProductsByIds(currentState, params);
  }
  if (normalized.startsWith('SELECT QUANTITY FROM PRODUCTS WHERE ID =')) {
    return handleSelectProductQuantity(currentState, params);
  }
  if (normalized.startsWith('UPDATE PRODUCTS SET QUANTITY = QUANTITY -')) {
    return handleUpdateProductQuantity(currentState, params);
  }
  if (normalized.startsWith('INSERT INTO PEDIDOS (USUARIO_ID, ENDERECO, FORMA_PAGAMENTO, STATUS, TOTAL, DATA_PEDIDO)')) {
    return handleInsertPedido(currentState, params);
  }
  if (normalized.startsWith('INSERT INTO PEDIDOS_PRODUTOS')) {
    return handleInsertPedidoProduto(currentState, params);
  }
  if (normalized.startsWith('SELECT * FROM PEDIDOS WHERE ID =')) {
    return handleSelectPedidoById(currentState, params);
  }
  if (normalized.startsWith('SELECT * FROM PEDIDOS')) {
    return handleSelectPedidos(currentState, params);
  }
  if (normalized.startsWith('SELECT P.ID, P.USUARIO_ID')) {
    return handleSelectPedidosResumo(currentState, params);
  }
  if (normalized.startsWith('SELECT PR.ID, PR.NAME, PP.VALOR_UNITARIO')) {
    return handleSelectItensByPedido(currentState, params);
  }
  if (normalized.startsWith('SELECT PP.PEDIDO_ID, PR.NAME AS PRODUTO_NOME')) {
    return handleAdminPedidoItens(currentState, params);
  }
  if (normalized.startsWith('SELECT P.ID AS PEDIDO_ID')) {
    return handleAdminPedidos(currentState, params);
  }
  if (normalized.startsWith('SELECT QUANTIDADE, VALOR_UNITARIO FROM PEDIDOS_PRODUTOS WHERE PEDIDO_ID =')) {
    return respondRows(
      currentState.tables.pedidos_produtos
        .filter((item) => item.pedido_id === Number(params[0]))
        .map((item) => ({ quantidade: item.quantidade, valor_unitario: item.valor_unitario }))
    );
  }
  if (normalized.startsWith('DELETE FROM PEDIDOS_PRODUTOS WHERE PEDIDO_ID =')) {
    return handleDeletePedidoItens(currentState, params);
  }
  if (normalized.startsWith('UPDATE PEDIDOS SET TOTAL =')) {
    return handleUpdatePedidoTotal(currentState, params);
  }
  if (normalized.startsWith('UPDATE PEDIDOS SET ENDERECO =')) {
    return handleUpdatePedidoEndereco(currentState, params);
  }

  // Default: return empty result
  return respondRows([]);
}

async function query(sql, params = []) {
  return runQuery(state, sql, params);
}

async function execute(sql, params = []) {
  return runQuery(state, sql, params);
}

async function getConnection() {
  let snapshot = null;
  let inTransaction = false;

  return {
    beginTransaction: async () => {
      if (!inTransaction) {
        snapshot = cloneState(state);
        inTransaction = true;
      }
    },
    commit: async () => {
      snapshot = null;
      inTransaction = false;
    },
    rollback: async () => {
      if (snapshot) {
        state = cloneState(snapshot);
      }
      snapshot = null;
      inTransaction = false;
    },
    query: (sql, params = []) => runQuery(state, sql, params),
    execute: (sql, params = []) => runQuery(state, sql, params),
    release: async () => {},
  };
}

async function reset() {
  state = createInitialState();
}

module.exports = {
  query,
  execute,
  getConnection,
  reset,
};
