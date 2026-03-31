/**
 * @openapi
 * tags:
 *   - name: Shipping
 *     description: Cálculo de frete por CEP (frete grátis por produto + zonas + fallback)
 */

/**
 * @openapi
 * /api/shipping/quote:
 *   get:
 *     summary: Cota frete por CEP
 *     description: |
 *       Retorna preço e prazo (dias) conforme regras de frete.
 *
 *       Prioridade de aplicação (ordem correta):
 *       1) Regra do produto (frete grátis por produto / a partir de X unidades)
 *       2) Zona (shipping_zones + shipping_zone_cities por UF + cidade via ViaCEP)
 *       3) Faixa de CEP (fallback em shipping_rates)
 *
 *       Regra 1 — Frete grátis por produto (PRODUCT_FREE):
 *       - Busca no banco os produtos presentes em `items` (por id).
 *       - Lê `products.shipping_free` e `products.shipping_free_from_qty`.
 *       - Se QUALQUER item qualificar a regra do próprio produto:
 *         - shipping_free = 1 e
 *           - shipping_free_from_qty IS NULL (qualquer quantidade) OU
 *           - quantidade >= shipping_free_from_qty
 *         então o preço final retorna `price = 0` e `ruleApplied = "PRODUCT_FREE"`.
 *
 *       Observação: a API pode manter `prazo_dias`/`zone` calculados pela base (zona/faixa),
 *       mesmo quando `price = 0`, para não perder o SLA de entrega no frontend.
 *
 *       Parâmetros:
 *       - `cep` deve conter 8 dígitos (com ou sem máscara).
 *       - `items` é um JSON stringificado (urlencoded) com itens do carrinho.
 *         Exemplo: items=[{"id":1,"quantidade":2}]
 *
 *       Regras de validação:
 *       - carrinho vazio => 400
 *       - CEP inválido => 400
 *       - itens inválidos / produto inexistente => 400
 *       - sem cobertura => 404 (quando não houver zona nem faixa de CEP aplicável)
 *
 *       Campos relevantes de resposta:
 *       - `price`: número (0 quando frete grátis)
 *       - `prazo_dias`: número | null
 *       - `is_free`: boolean
 *       - `ruleApplied`: "PRODUCT_FREE" | "ZONE" | "CEP_RANGE"
 *       - `freeItems`: itens que qualificaram (quando ruleApplied=PRODUCT_FREE)
 *       - `zone`: detalhes da zona aplicada (quando houver)
 *     tags:
 *       - Shipping
 *     parameters:
 *       - in: query
 *         name: cep
 *         required: true
 *         schema:
 *           type: string
 *         example: "36940-000"
 *       - in: query
 *         name: items
 *         required: true
 *         schema:
 *           type: string
 *         example: '[{"id":1,"quantidade":2}]'
 *     responses:
 *       200:
 *         description: Cotação de frete
 *       400:
 *         description: CEP inválido, carrinho vazio, itens inválidos ou produto inexistente
 *       404:
 *         description: CEP sem cobertura
 *       500:
 *         description: Erro interno
 */
