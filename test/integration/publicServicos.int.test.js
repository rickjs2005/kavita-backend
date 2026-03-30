/**
 * test/integration/publicServicos.int.test.js
 *
 * Rotas testadas (routes/public/publicServicos.js):
 *   GET  /api/public/servicos
 *   GET  /api/public/servicos/:id
 *   POST /api/public/servicos/solicitacoes
 *   POST /api/public/servicos/avaliacoes
 *   GET  /api/public/servicos/:id/avaliacoes
 *   POST /api/public/servicos/:id/view
 *   POST /api/public/servicos/:id/whatsapp
 *   POST /api/public/servicos/trabalhe-conosco
 *
 * Padrão:
 *   - Sem MySQL real: pool e getConnection mockados via jest.doMock
 *   - Controller mockado via jest.doMock (testa wiring de rota + validate middleware)
 *   - makeTestApp(mountPath, router) de test/testUtils.js
 *   - AAA (Arrange → Act → Assert)
 *   - jest.resetModules() antes de cada módulo carregado
 */

"use strict";

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");
const ERROR_CODES = require("../../constants/ErrorCodes");

describe("Public Servicos routes (routes/public/publicServicos.js)", () => {
  const originalEnv = process.env;
  const MOUNT_PATH = "/api/public/servicos";

  // Classe de erro compatível com AppError (mesma assinatura: message, code, status, details)
  class FakeAppError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.name = "AppError";
      this.code = code;
      this.status = status;
      if (details !== undefined) this.details = details;
    }
  }

  let app;
  let mockCtrl;
  let mockPool;
  let mockConn;

  beforeEach(() => {
    jest.resetModules();

    process.env = { ...originalEnv, NODE_ENV: "test" };

    mockConn = makeMockConn();
    mockPool = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(mockConn),
    };

    // Controladores mockados — apenas registram que foram chamados e respondem OK
    mockCtrl = {
      listServicos: jest.fn((req, res) => res.status(200).json({ ok: true, data: [], meta: {} })),
      getServico: jest.fn((req, res) => res.status(200).json({ ok: true, data: { id: req.params.id } })),
      createSolicitacao: jest.fn((req, res) => res.status(201).json({ ok: true, data: { id: 1 } })),
      createAvaliacao: jest.fn((req, res) => res.status(201).json({ ok: true, data: { id: 1 } })),
      listAvaliacoes: jest.fn((req, res) => res.status(200).json({ ok: true, data: [] })),
      registerView: jest.fn((req, res) => res.status(200).json({ ok: true })),
      registerWhatsappClick: jest.fn((req, res) => res.status(200).json({ ok: true })),
      createTrabalheConosco: jest.fn((req, res) => res.status(201).json({ ok: true, data: { id: 1 } })),
    };

    const poolPath = require.resolve("../../config/pool");
    const appErrorPath = require.resolve("../../errors/AppError");
    const ctrlPath = require.resolve("../../controllers/servicosPublicController");

    jest.doMock(poolPath, () => mockPool);
    jest.doMock(appErrorPath, () => FakeAppError);
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/public/publicServicos");
    app = makeTestApp(MOUNT_PATH, router);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe("GET /", () => {
    test("sem params → 200, chama listServicos", async () => {
      const res = await request(app).get(MOUNT_PATH);
      expect(res.status).toBe(200);
      expect(mockCtrl.listServicos).toHaveBeenCalledTimes(1);
    });

    test("com params válidos → 200", async () => {
      const res = await request(app)
        .get(MOUNT_PATH)
        .query({ page: "2", limit: "6", sort: "nome", order: "ASC", busca: "eletricista" });
      expect(res.status).toBe(200);
      expect(mockCtrl.listServicos).toHaveBeenCalledTimes(1);
    });

    test("params inválidos são normalizados (nunca retorna 400 no GET /)", async () => {
      const res = await request(app)
        .get(MOUNT_PATH)
        .query({ page: "abc", limit: "99999", sort: "invalid; DROP", order: "HACK" });
      expect(res.status).toBe(200);
      expect(mockCtrl.listServicos).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  describe("GET /:id", () => {
    test("ID válido → 200, chama getServico", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/42`);
      expect(res.status).toBe(200);
      expect(mockCtrl.getServico).toHaveBeenCalledTimes(1);
    });

    test("ID='0' → 400 (falha de validação)", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/0`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(mockCtrl.getServico).not.toHaveBeenCalled();
    });

    test("ID='abc' → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/abc`);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(mockCtrl.getServico).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /solicitacoes
  // -------------------------------------------------------------------------

  describe("POST /solicitacoes", () => {
    const VALID_BODY = {
      colaborador_id: 1,
      nome_contato: "João Silva",
      whatsapp: "11999999999",
      descricao: "Preciso de um pintor.",
    };

    test("corpo válido → 201, chama createSolicitacao", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/solicitacoes`)
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(mockCtrl.createSolicitacao).toHaveBeenCalledTimes(1);
    });

    test("colaborador_id ausente → 400", async () => {
      const { colaborador_id, ...body } = VALID_BODY;
      const res = await request(app)
        .post(`${MOUNT_PATH}/solicitacoes`)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(mockCtrl.createSolicitacao).not.toHaveBeenCalled();
    });

    test("nome_contato vazio → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/solicitacoes`)
        .send({ ...VALID_BODY, nome_contato: "" });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test("descricao ausente → 400", async () => {
      const { descricao, ...body } = VALID_BODY;
      const res = await request(app)
        .post(`${MOUNT_PATH}/solicitacoes`)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test("erros de validação incluem details.fields", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/solicitacoes`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
      expect(Array.isArray(res.body.details.fields)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /avaliacoes
  // -------------------------------------------------------------------------

  describe("POST /avaliacoes", () => {
    const VALID_BODY = { colaborador_id: 1, nota: 5 };

    test("corpo válido → 201, chama createAvaliacao", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/avaliacoes`)
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(mockCtrl.createAvaliacao).toHaveBeenCalledTimes(1);
    });

    test("nota=0 → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/avaliacoes`)
        .send({ ...VALID_BODY, nota: 0 });
      expect(res.status).toBe(400);
      expect(mockCtrl.createAvaliacao).not.toHaveBeenCalled();
    });

    test("nota=6 → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/avaliacoes`)
        .send({ ...VALID_BODY, nota: 6 });
      expect(res.status).toBe(400);
    });

    test("nota ausente → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/avaliacoes`)
        .send({ colaborador_id: 1 });
      expect(res.status).toBe(400);
    });

    test("colaborador_id ausente → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/avaliacoes`)
        .send({ nota: 4 });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id/avaliacoes
  // -------------------------------------------------------------------------

  describe("GET /:id/avaliacoes", () => {
    test("ID válido → 200, chama listAvaliacoes", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/7/avaliacoes`);
      expect(res.status).toBe(200);
      expect(mockCtrl.listAvaliacoes).toHaveBeenCalledTimes(1);
    });

    test("ID inválido → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/0/avaliacoes`);
      expect(res.status).toBe(400);
      expect(mockCtrl.listAvaliacoes).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/view
  // -------------------------------------------------------------------------

  describe("POST /:id/view", () => {
    test("ID válido → 200, chama registerView", async () => {
      const res = await request(app).post(`${MOUNT_PATH}/3/view`);
      expect(res.status).toBe(200);
      expect(mockCtrl.registerView).toHaveBeenCalledTimes(1);
    });

    test("ID='abc' → 400", async () => {
      const res = await request(app).post(`${MOUNT_PATH}/abc/view`);
      expect(res.status).toBe(400);
      expect(mockCtrl.registerView).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/whatsapp
  // -------------------------------------------------------------------------

  describe("POST /:id/whatsapp", () => {
    test("ID válido → 200, chama registerWhatsappClick", async () => {
      const res = await request(app).post(`${MOUNT_PATH}/3/whatsapp`);
      expect(res.status).toBe(200);
      expect(mockCtrl.registerWhatsappClick).toHaveBeenCalledTimes(1);
    });

    test("ID inválido → 400", async () => {
      const res = await request(app).post(`${MOUNT_PATH}/-1/whatsapp`);
      expect(res.status).toBe(400);
      expect(mockCtrl.registerWhatsappClick).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST /trabalhe-conosco
  // -------------------------------------------------------------------------

  describe("POST /trabalhe-conosco", () => {
    const VALID_BODY = { nome: "Maria Souza", whatsapp: "11988887777" };

    test("corpo mínimo válido → 201, chama createTrabalheConosco", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(mockCtrl.createTrabalheConosco).toHaveBeenCalledTimes(1);
    });

    test("nome ausente → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send({ whatsapp: "11988887777" });
      expect(res.status).toBe(400);
      expect(mockCtrl.createTrabalheConosco).not.toHaveBeenCalled();
    });

    test("whatsapp vazio → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send({ nome: "Maria", whatsapp: "" });
      expect(res.status).toBe(400);
    });

    test("especialidade_id inválido → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send({ ...VALID_BODY, especialidade_id: 0 });
      expect(res.status).toBe(400);
    });

    test("especialidade_id válido → 201", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send({ ...VALID_BODY, especialidade_id: 2 });
      expect(res.status).toBe(201);
    });

    test("corpo vazio → 400 com details.fields", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/trabalhe-conosco`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
      expect(Array.isArray(res.body.details.fields)).toBe(true);
    });
  });
});
