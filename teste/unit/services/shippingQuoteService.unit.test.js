/**
 * teste/unit/services/shippingQuoteService.unit.test.js
 *
 * Unit tests para services/shippingQuoteService.js
 * - Sem MySQL real: mock config/pool
 * - Sem rede externa: mock global.fetch (ViaCEP)
 * - AAA: Arrange -> Act -> Assert
 */

describe("services/shippingQuoteService", () => {
    const poolPath = require.resolve("../../../config/pool");
    const servicePath = require.resolve("../../../services/shippingQuoteService");
    const AppError = require("../../../errors/AppError");
    const ERROR_CODES = require("../../../constants/ErrorCodes");

    let pool;
    let shippingQuoteService;

    // helper: cria resposta fetch padrão
    function mockFetchOk({ uf = "MG", localidade = "Belo Horizonte", erro = false } = {}) {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => (erro ? { erro: true } : { uf, localidade }),
        }));
    }

    function mockFetchFail() {
        global.fetch = jest.fn(async () => {
            throw new Error("network down");
        });
    }

    /**
     * Mock DB por "roteamento" de SQL.
     * Você passa um objeto scenario com os retornos.
     */
    function mockPoolScenario(scenario) {
        pool.query.mockImplementation(async (sql, params) => {
            const s = String(sql);

            // 1) products
            if (s.includes("FROM products") && s.includes("shipping_free")) {
                return [scenario.products ?? [], undefined];
            }

            // 2) zones
            if (s.includes("FROM shipping_zones")) {
                return [scenario.zones ?? [], undefined];
            }

            // 3) zone cities (match por city)
            if (s.includes("FROM shipping_zone_cities")) {
                // params: [zone_id, cityLower]
                const zoneId = params?.[0];
                const cityLower = params?.[1];
                const allowed = (scenario.zoneCitiesMatches ?? []).some(
                    (x) => Number(x.zoneId) === Number(zoneId) && String(x.cityLower) === String(cityLower)
                );
                return [allowed ? [{ 1: 1 }] : [], undefined];
            }

            // 4) shipping_rates
            if (s.includes("FROM shipping_rates") && s.includes("faixa_cep_inicio")) {
                return [scenario.rates ?? [], undefined];
            }

            // fallback seguro
            return [[], undefined];
        });
    }

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Mock do pool real usado pelo service
        jest.doMock(poolPath, () => ({
            query: jest.fn(),
            getConnection: jest.fn(),
        }));

        pool = require(poolPath);

        // mock fetch (cada teste ajusta)
        global.fetch = jest.fn();

        // agora importa o service (já com mocks aplicados)
        shippingQuoteService = require(servicePath);

        // silencia logs caso existam (este service não loga, mas mantemos padrão)
        jest.spyOn(console, "error").mockImplementation(() => { });
    });

    afterEach(() => {
        console.error.mockRestore?.();
        // limpeza do fetch
        delete global.fetch;
    });

    describe("helpers", () => {
        test("parseCep: remove não-dígitos e corta em 8", () => {
            expect(shippingQuoteService.parseCep("12.345-67890")).toBe("12345678");
            expect(shippingQuoteService.parseCep("")).toBe("");
            expect(shippingQuoteService.parseCep(null)).toBe("");
        });

        test("normalizeItems: aceita array com id/quantidade e remove inválidos", () => {
            const out = shippingQuoteService.normalizeItems([
                { id: "1", quantidade: "2" },
                { productId: 2, qty: 1 },
                { produtoId: 0, quantidade: 2 }, // inválido
                { id: 3, quantidade: 0 }, // inválido
            ]);
            expect(out).toEqual([
                { id: 1, quantidade: 2 },
                { id: 2, quantidade: 1 },
            ]);
        });

        test("normalizeItems: aceita string JSON e normaliza", () => {
            const out = shippingQuoteService.normalizeItems('[{"id":5,"qty":3}]');
            expect(out).toEqual([{ id: 5, quantidade: 3 }]);
        });

        test("normalizeItems: string inválida / objeto inválido => null", () => {
            expect(shippingQuoteService.normalizeItems("{bad")).toBeNull();
            expect(shippingQuoteService.normalizeItems({})).toBeNull();
            expect(shippingQuoteService.normalizeItems([])).toBeNull();
        });
    });

    describe("getQuote()", () => {
        test("CEP inválido (<8 dígitos): deve lançar AppError 400 VALIDATION_ERROR", async () => {
            // Arrange
            mockFetchOk();
            mockPoolScenario({});

            // Act / Assert
            await expect(
                shippingQuoteService.getQuote({ cep: "12345-67", items: [{ id: 1, quantidade: 1 }] })
            ).rejects.toMatchObject({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
            });
        });

        test("Carrinho vazio/itens inválidos: deve lançar AppError 400", async () => {
            // Arrange
            mockFetchOk();
            mockPoolScenario({});

            // Act / Assert
            await expect(
                shippingQuoteService.getQuote({ cep: "12345678", items: [] })
            ).rejects.toMatchObject({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
            });
            await expect(
                shippingQuoteService.getQuote({ cep: "12345678", items: [{ id: 1, quantidade: 0 }] })
            ).rejects.toMatchObject({ status: 400, code: ERROR_CODES.VALIDATION_ERROR });
        });

        test("Produtos não encontrados: deve lançar AppError 400 com ids faltantes", async () => {
            // Arrange
            mockFetchOk();
            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
            });

            // Act / Assert (pediu 1 e 2, mas DB só devolve 1)
            await expect(
                shippingQuoteService.getQuote({
                    cep: "30140071",
                    items: [{ id: 1, quantidade: 1 }, { id: 2, quantidade: 1 }],
                })
            ).rejects.toMatchObject({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
            });
        });

        test("ViaCEP não retorna UF/cidade: deve lançar AppError 400", async () => {
            // Arrange
            global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ erro: true }) }));
            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
            });

            // Act / Assert
            await expect(
                shippingQuoteService.getQuote({
                    cep: "30140071",
                    items: [{ id: 1, quantidade: 1 }],
                })
            ).rejects.toMatchObject({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
            });
        });

        test("fallback CEP_RANGE: sem cobertura => AppError 404 NOT_FOUND", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "CidadeX" });
            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
                zones: [],   // sem zonas
                rates: [],   // sem faixa de CEP
            });

            // Act / Assert
            await expect(
                shippingQuoteService.getQuote({
                    cep: "30140071",
                    items: [{ id: 1, quantidade: 1 }],
                })
            ).rejects.toMatchObject({
                status: 404,
                code: ERROR_CODES.NOT_FOUND,
            });
        });

        test("CEP_RANGE aplicado: retorna price/ruleApplied=CEP_RANGE e prazo=merge(max)", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "CidadeX" });
            mockPoolScenario({
                products: [
                    { id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: 2 },
                    { id: 2, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: 7 },
                ],
                zones: [], // força fallback
                rates: [
                    { id: 9, faixa_cep_inicio: "00000000", faixa_cep_fim: "99999999", preco: 25.5, prazo_dias: 4 },
                ],
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30.140-071",
                items: [{ id: 1, quantidade: 1 }, { id: 2, quantidade: 1 }],
            });

            // Assert
            expect(res).toMatchObject({
                cep: "30140071",
                price: 25.5,
                is_free: false,
                ruleApplied: "CEP_RANGE",
                zone: null,
            });

            // prazoFinal = max(base=4, productMax=7) => 7
            expect(res.prazo_dias).toBe(7);
        });

        test("ZONE por cidade: aplica zona específica e prazoFinal = max(zona, produto)", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "Belo Horizonte" });

            mockPoolScenario({
                products: [
                    { id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: 3 },
                ],
                zones: [
                    // prioridade: all_cities ASC (0 primeiro), depois id DESC
                    { id: 10, name: "BH", state: "MG", all_cities: 0, is_free: 0, price: 12.0, prazo_dias: 2 },
                ],
                zoneCitiesMatches: [{ zoneId: 10, cityLower: "belo horizonte" }],
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30140071",
                items: [{ id: 1, quantidade: 1 }],
            });

            // Assert
            expect(res.ruleApplied).toBe("ZONE");
            expect(res.price).toBe(12.0);
            expect(res.is_free).toBe(false);

            // prazoFinal = max(zona=2, produto=3) => 3
            expect(res.prazo_dias).toBe(3);

            expect(res.zone).toMatchObject({
                id: 10,
                name: "BH",
                state: "MG",
                city: "Belo Horizonte",
            });
        });

        test("ZONE all_cities=1 (estado inteiro): aplica zona do estado quando não achar cidade", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "CidadeSemMatch" });

            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
                zones: [
                    { id: 3, name: "MG - Geral", state: "MG", all_cities: 1, is_free: 0, price: 20, prazo_dias: 5 },
                ],
                zoneCitiesMatches: [], // nenhuma cidade específica
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30140071",
                items: [{ id: 1, quantidade: 1 }],
            });

            // Assert
            expect(res.ruleApplied).toBe("ZONE");
            expect(res.price).toBe(20);
            expect(res.prazo_dias).toBe(5);
            expect(res.zone).toMatchObject({ name: "MG - Geral", state: "MG" });
        });

        test("Zona com is_free=1: baseQuote price=0 e is_free=true", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "Belo Horizonte" });

            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
                zones: [
                    { id: 10, name: "BH", state: "MG", all_cities: 0, is_free: 1, price: 999, prazo_dias: 2 },
                ],
                zoneCitiesMatches: [{ zoneId: 10, cityLower: "belo horizonte" }],
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30140071",
                items: [{ id: 1, quantidade: 1 }],
            });

            // Assert
            expect(res.ruleApplied).toBe("ZONE");
            expect(res.price).toBe(0);
            expect(res.is_free).toBe(true);
        });

        test("PRODUCT_FREE: se qualquer item qualifica, price=0, is_free=true, ruleApplied=PRODUCT_FREE e mantém prazoFinal", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "Belo Horizonte" });

            mockPoolScenario({
                products: [
                    // item 1: shipping_free=1 e from_qty=null => ALWAYS
                    { id: 1, shipping_free: 1, shipping_free_from_qty: null, shipping_prazo_dias: 10 },
                    // item 2: normal
                    { id: 2, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: 3 },
                ],
                zones: [
                    { id: 10, name: "BH", state: "MG", all_cities: 0, is_free: 0, price: 15, prazo_dias: 2 },
                ],
                zoneCitiesMatches: [{ zoneId: 10, cityLower: "belo horizonte" }],
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30140071",
                items: [{ id: 1, quantidade: 1 }, { id: 2, quantidade: 1 }],
            });

            // Assert
            expect(res.ruleApplied).toBe("PRODUCT_FREE");
            expect(res.price).toBe(0);
            expect(res.is_free).toBe(true);
            expect(Array.isArray(res.freeItems)).toBe(true);
            expect(res.freeItems[0]).toMatchObject({ id: 1, quantidade: 1, reason: "ALWAYS" });

            // prazoFinal = max(base=2, productMax=10) => 10 (mesmo com preço 0)
            expect(res.prazo_dias).toBe(10);

            // zone ainda é retornada para UI/debug
            expect(res.zone).toMatchObject({ id: 10, state: "MG" });
        });

        test("PRODUCT_FREE por quantidade mínima: reason FROM_QTY_X quando qty >= shipping_free_from_qty", async () => {
            // Arrange
            mockFetchOk({ uf: "MG", localidade: "Belo Horizonte" });

            mockPoolScenario({
                products: [
                    { id: 1, shipping_free: 1, shipping_free_from_qty: 5, shipping_prazo_dias: null },
                ],
                zones: [
                    { id: 10, name: "BH", state: "MG", all_cities: 0, is_free: 0, price: 15, prazo_dias: 2 },
                ],
                zoneCitiesMatches: [{ zoneId: 10, cityLower: "belo horizonte" }],
            });

            // Act
            const res = await shippingQuoteService.getQuote({
                cep: "30140071",
                items: [{ id: 1, quantidade: 5 }],
            });

            // Assert
            expect(res.ruleApplied).toBe("PRODUCT_FREE");
            expect(res.freeItems[0].reason).toBe("FROM_QTY_5");
        });

        test("ViaCEP fetch falha (throw): deve lançar AppError 400 (não identificou UF/cidade)", async () => {
            // Arrange
            mockFetchFail();
            mockPoolScenario({
                products: [{ id: 1, shipping_free: 0, shipping_free_from_qty: null, shipping_prazo_dias: null }],
            });

            // Act / Assert
            await expect(
                shippingQuoteService.getQuote({
                    cep: "30140071",
                    items: [{ id: 1, quantidade: 1 }],
                })
            ).rejects.toMatchObject({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
            });
        });
    });
});
