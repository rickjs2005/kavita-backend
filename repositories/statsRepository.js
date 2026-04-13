"use strict";
// repositories/statsRepository.js
// SQL queries for admin dashboard stats.

const pool = require("../config/pool");

async function getDashboardSummary() {
  // Current period (last 30 days) + previous period (30-60 days) in parallel
  const [
    [[prodRow]],
    [[pedRow]],
    [[pedPrevRow]],
    [[cliRow]],
    [[cliPrevRow]],
    [[destRow]],
    [[servRow]],
    [[vendasRow]],
    [[vendasPrevRow]],
  ] = await Promise.all([
    pool.query("SELECT COUNT(*) AS total FROM products"),
    pool.query(
      "SELECT COUNT(*) AS total FROM pedidos WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM pedidos
       WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         AND data_pedido < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    ),
    pool.query("SELECT COUNT(*) AS total FROM usuarios"),
    pool.query(
      `SELECT COUNT(*) AS total FROM usuarios
       WHERE criado_em < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    ),
    pool.query("SELECT COUNT(*) AS total FROM product_promotions"),
    pool.query("SELECT COUNT(*) AS total FROM colaboradores"),
    pool.query(`
      SELECT
        COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS totalVendas,
        COUNT(DISTINCT p.id) AS pedidosPagos
      FROM pedidos p
      JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.status_pagamento = 'pago'
        AND p.data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS totalVendas,
        COUNT(DISTINCT p.id) AS pedidosPagos
      FROM pedidos p
      JOIN pedidos_produtos pp ON pp.pedido_id = p.id
      WHERE p.status_pagamento = 'pago'
        AND p.data_pedido >= DATE_SUB(NOW(), INTERVAL 60 DAY)
        AND p.data_pedido < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `),
  ]);

  const totalVendas30Dias = Number(vendasRow.totalVendas || 0);
  const pedidosPagos30 = Number(vendasRow.pedidosPagos || 0);
  const totalVendasPrev = Number(vendasPrevRow.totalVendas || 0);
  const pedidosPagosPrev = Number(vendasPrevRow.pedidosPagos || 0);
  const totalPedidosPrev = Number(pedPrevRow.total || 0);
  const totalClientesPrev = Number(cliPrevRow.total || 0);
  const totalClientes = Number(cliRow.total || 0);
  const totalPedidosUltimos30 = Number(pedRow.total || 0);
  const ticketMedio = pedidosPagos30 > 0 ? totalVendas30Dias / pedidosPagos30 : 0;
  const ticketMedioPrev = pedidosPagosPrev > 0 ? totalVendasPrev / pedidosPagosPrev : 0;

  return {
    totalProdutos: Number(prodRow.total || 0),
    totalPedidosUltimos30,
    totalClientes,
    totalDestaques: Number(destRow.total || 0),
    totalServicos: Number(servRow.total || 0),
    totalVendas30Dias,
    ticketMedio,
    // Previous period for comparison
    prev: {
      totalVendas30Dias: totalVendasPrev,
      totalPedidosUltimos30: totalPedidosPrev,
      totalClientes: totalClientesPrev,
      ticketMedio: ticketMedioPrev,
    },
  };
}

async function getSalesSeries(rangeDays) {
  const [rows] = await pool.query(
    `
    SELECT
      DATE(p.data_pedido) AS dia,
      COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS total
    FROM pedidos p
    JOIN pedidos_produtos pp ON pp.pedido_id = p.id
    WHERE p.status_pagamento = 'pago'
      AND p.data_pedido >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    GROUP BY DATE(p.data_pedido)
    ORDER BY dia ASC
    `,
    [rangeDays]
  );
  return rows;
}

async function getTopProducts(limit) {
  const [rows] = await pool.query(
    `
    SELECT
      pr.id,
      pr.name,
      SUM(pp.quantidade) AS quantidadeVendida,
      SUM(pp.quantidade * pp.valor_unitario) AS totalVendido
    FROM pedidos_produtos pp
    JOIN pedidos p   ON p.id = pp.pedido_id
    JOIN products pr ON pr.id = pp.produto_id
    WHERE p.status_pagamento = 'pago'
    GROUP BY pr.id, pr.name
    ORDER BY quantidadeVendida DESC
    LIMIT ?
    `,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    quantidadeVendida: Number(r.quantidadeVendida || 0),
    totalVendido: Number(r.totalVendido || 0),
  }));
}

async function getAlertas() {
  const alertas = [];
  let idCounter = 1;

  // 1. Out-of-stock products (quantity = 0, active)
  const [[zeroStockRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM products WHERE quantity = 0 AND (is_active = 1 OR is_active IS NULL)"
  );
  const zeroStock = Number(zeroStockRow.total || 0);
  if (zeroStock > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "danger",
      tipo: "estoque",
      titulo: `${zeroStock} produto(s) sem estoque`,
      mensagem: "Produtos ativos com quantidade zero. Clientes não conseguem comprar.",
      link: "/admin/relatorios/estoque",
      link_label: "Ver estoque",
    });
  }

  // 2. Low-stock products (quantity between 1 and 5, active)
  const [[lowStockRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM products WHERE quantity BETWEEN 1 AND 5 AND (is_active = 1 OR is_active IS NULL)"
  );
  const lowStock = Number(lowStockRow.total || 0);
  if (lowStock > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "warning",
      tipo: "estoque",
      titulo: `${lowStock} produto(s) com estoque baixo`,
      mensagem: "Produtos com 5 unidades ou menos. Considere reabastecer.",
      link: "/admin/relatorios/estoque",
      link_label: "Ver estoque",
    });
  }

  // 3. Pending payment orders older than 24h
  const [[pendingOrdersRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM pedidos
     WHERE status_pagamento = 'pendente'
       AND data_pedido < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  );
  const pendingOrders = Number(pendingOrdersRow.total || 0);
  if (pendingOrders > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "warning",
      tipo: "pagamento",
      titulo: `${pendingOrders} pedido(s) pendente(s) há mais de 24h`,
      mensagem: "Pedidos aguardando pagamento por mais de um dia.",
      link: "/admin/pedidos",
      link_label: "Ver pedidos",
    });
  }

  // 4. Abandoned carts (open carts updated > 24h ago)
  const [[abandonedCartsRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM carrinhos
     WHERE status = 'aberto'
       AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  );
  const abandonedCarts = Number(abandonedCartsRow.total || 0);
  if (abandonedCarts > 0) {
    // Approximate total value of abandoned carts
    const [[abandonedValueRow]] = await pool.query(
      `SELECT COALESCE(SUM(ci.quantidade * ci.valor_unitario), 0) AS total
       FROM carrinho_itens ci
       JOIN carrinhos c ON c.id = ci.carrinho_id
       WHERE c.status = 'aberto'
         AND c.updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    const abandonedValue = Number(abandonedValueRow.total || 0);
    const formattedValue = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(abandonedValue);

    alertas.push({
      id: String(idCounter++),
      nivel: "warning",
      tipo: "carrinhos",
      titulo: `${abandonedCarts} carrinho(s) abandonado(s)`,
      mensagem: `Carrinhos inativos há mais de 24h. Valor total: ${formattedValue}.`,
      link: "/admin/carrinhos",
      link_label: "Ver carrinhos",
    });
  }

  // 5. Promotions expiring within 48h
  const [[expiringPromosRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM product_promotions
     WHERE is_active = 1
       AND end_at IS NOT NULL
       AND end_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 48 HOUR)`
  );
  const expiringPromos = Number(expiringPromosRow.total || 0);
  if (expiringPromos > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "info",
      tipo: "sistema",
      titulo: `${expiringPromos} promoção(ões) expirando em 48h`,
      mensagem: "Promoções ativas que vão encerrar em breve. Renove ou substitua.",
      link: "/admin/destaques",
      link_label: "Ver promoções",
    });
  }

  // 6. Coupons expiring within 48h
  const [[expiringCouponsRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM cupons
     WHERE ativo = 1
       AND expiracao IS NOT NULL
       AND expiracao BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 48 HOUR)`
  );
  const expiringCoupons = Number(expiringCouponsRow.total || 0);
  if (expiringCoupons > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "info",
      tipo: "sistema",
      titulo: `${expiringCoupons} cupom(ns) expirando em 48h`,
      mensagem: "Cupons de desconto que vão expirar em breve.",
      link: "/admin/cupons",
      link_label: "Ver cupons",
    });
  }

  // 7. Orders awaiting shipment (paid but not yet shipped)
  const [[awaitingShipmentRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM pedidos
     WHERE status_pagamento = 'pago'
       AND status_entrega IN ('em_separacao', 'processando')`
  );
  const awaitingShipment = Number(awaitingShipmentRow.total || 0);
  if (awaitingShipment > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "info",
      tipo: "pagamento",
      titulo: `${awaitingShipment} pedido(s) aguardando envio`,
      mensagem: "Pedidos pagos que ainda não foram enviados.",
      link: "/admin/pedidos",
      link_label: "Ver pedidos",
    });
  }

  // 8. Open incidents without response > 24h
  const [[openIncidentsRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM pedido_ocorrencias
     WHERE status IN ('aberta', 'em_analise')
       AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  );
  const openIncidents = Number(openIncidentsRow.total || 0);
  if (openIncidents > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "warning",
      tipo: "sistema",
      titulo: `${openIncidents} ocorrência(s) sem resposta há mais de 24h`,
      mensagem: "Clientes aguardando resolução de problemas com pedidos.",
      link: "/admin/ocorrencias",
      link_label: "Ver ocorrências",
    });
  }

  // 9. Unread contact messages
  const [[unreadMessagesRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM mensagens_contato WHERE status = 'nova'"
  );
  const unreadMessages = Number(unreadMessagesRow.total || 0);
  if (unreadMessages > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: unreadMessages >= 5 ? "warning" : "info",
      tipo: "sistema",
      titulo: `${unreadMessages} mensagem(ns) de contato não lida(s)`,
      mensagem: "Mensagens do formulário de contato aguardando leitura.",
      link: "/admin/contato-mensagens",
      link_label: "Ver mensagens",
    });
  }

  // 10. Pending service verifications
  const [[pendingServicesRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM colaboradores WHERE verificado = 0"
  );
  const pendingServices = Number(pendingServicesRow.total || 0);
  if (pendingServices > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "info",
      tipo: "sistema",
      titulo: `${pendingServices} serviço(s) aguardando verificação`,
      mensagem: "Prestadores de serviço pendentes de aprovação.",
      link: "/admin/servicos",
      link_label: "Ver serviços",
    });
  }

  // 11. Pending coffee broker submissions
  const [[pendingBrokersRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM corretora_submissions WHERE status = 'pending'"
  );
  const pendingBrokers = Number(pendingBrokersRow.total || 0);
  if (pendingBrokers > 0) {
    alertas.push({
      id: String(idCounter++),
      nivel: "info",
      tipo: "sistema",
      titulo: `${pendingBrokers} solicitação(ões) de corretora pendente(s)`,
      mensagem: "Novas corretoras de café aguardando aprovação.",
      link: "/admin/mercado-do-cafe",
      link_label: "Ver solicitações",
    });
  }

  return alertas;
}

async function getModulesStatus() {
  const [
    [[heroActiveRow]],
    [[heroInactiveRow]],
    [[newsRow]],
    [[newsDraftRow]],
    [[climaRow]],
    [[climaLastSync]],
    [[cotacoesRow]],
    [[cotacoesLastRow]],
    [[dronesModelsRow]],
    [[dronesPendingRow]],
    [[corretorasRow]],
    [[corretorasPendingRow]],
    [[msgNovasRow]],
    [[msgTotalRow]],
  ] = await Promise.all([
    // Hero: active slides
    pool.query(
      "SELECT COUNT(*) AS total FROM hero_slides WHERE is_active = 1"
    ),
    // Hero: inactive slides
    pool.query(
      "SELECT COUNT(*) AS total FROM hero_slides WHERE is_active = 0"
    ),
    // News: published posts
    pool.query(
      "SELECT COUNT(*) AS total FROM news_posts WHERE status = 'published' AND ativo = 1"
    ),
    // News: draft posts
    pool.query(
      "SELECT COUNT(*) AS total FROM news_posts WHERE status = 'draft'"
    ),
    // Clima: active cities
    pool.query(
      "SELECT COUNT(*) AS total FROM news_clima WHERE ativo = 1"
    ),
    // Clima: last sync
    pool.query(
      "SELECT MAX(last_update_at) AS last_sync FROM news_clima WHERE ativo = 1"
    ),
    // Cotações: active quotes
    pool.query(
      "SELECT COUNT(*) AS total FROM news_cotacoes WHERE ativo = 1"
    ),
    // Cotações: last update
    pool.query(
      "SELECT MAX(last_update_at) AS last_update, MIN(last_sync_status) AS worst_status FROM news_cotacoes WHERE ativo = 1"
    ),
    // Drones: active models
    pool.query(
      "SELECT COUNT(*) AS total FROM drone_models WHERE is_active = 1"
    ),
    // Drones: pending comments
    pool.query(
      "SELECT COUNT(*) AS total FROM drone_comments WHERE status = 'PENDENTE'"
    ),
    // Corretoras: active
    pool.query(
      "SELECT COUNT(*) AS total FROM corretoras WHERE status = 'active'"
    ),
    // Corretoras: pending submissions
    pool.query(
      "SELECT COUNT(*) AS total FROM corretora_submissions WHERE status = 'pending'"
    ),
    // Mensagens de contato: novas (não lidas)
    pool.query(
      "SELECT COUNT(*) AS total FROM mensagens_contato WHERE status = 'nova'"
    ),
    // Mensagens de contato: total
    pool.query(
      "SELECT COUNT(*) AS total FROM mensagens_contato"
    ),
  ]);

  return {
    hero: {
      ativos: Number(heroActiveRow.total || 0),
      inativos: Number(heroInactiveRow.total || 0),
    },
    news: {
      publicados: Number(newsRow.total || 0),
      rascunhos: Number(newsDraftRow.total || 0),
    },
    clima: {
      cidadesAtivas: Number(climaRow.total || 0),
      ultimaSync: climaLastSync.last_sync || null,
    },
    cotacoes: {
      ativas: Number(cotacoesRow.total || 0),
      ultimaAtualizacao: cotacoesLastRow.last_update || null,
      statusSync: cotacoesLastRow.worst_status || null,
    },
    drones: {
      modelos: Number(dronesModelsRow.total || 0),
      comentariosPendentes: Number(dronesPendingRow.total || 0),
    },
    mercadoCafe: {
      corretorasAtivas: Number(corretorasRow.total || 0),
      solicitacoesPendentes: Number(corretorasPendingRow.total || 0),
    },
    mensagens: {
      naoLidas: Number(msgNovasRow.total || 0),
      total: Number(msgTotalRow.total || 0),
    },
  };
}

module.exports = {
  getDashboardSummary,
  getSalesSeries,
  getTopProducts,
  getAlertas,
  getModulesStatus,
};
