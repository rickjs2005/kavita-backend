// teste/integration/userAddresses.int.test.js

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("User Addresses Routes (integration)", () => {
  const poolPath = require.resolve("../../config/pool");
  const authPath = require.resolve("../../middleware/authenticateToken");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const routerPath = require.resolve("../../routes/userAddresses");

  let app;
  let pool;

  function loadAppWithMocks({ authUser = { id: 7, role: "user" } } = {}) {
    jest.resetModules();
    jest.clearAllMocks();

    // ErrorCodes (usados nesta rota)
    jest.doMock(errorCodesPath, () => ({
      VALIDATION_ERROR: "VALIDATION_ERROR",
      SERVER_ERROR: "SERVER_ERROR",
      NOT_FOUND: "NOT_FOUND",
      AUTH_ERROR: "AUTH_ERROR",
    }));

    // AppError compatível
    jest.doMock(appErrorPath, () => {
      return class AppError extends Error {
        constructor(message, code, status) {
          super(message);
          this.name = "AppError";
          this.code = code;
          this.status = status;
        }
      };
    });

    // Pool mock (sem MySQL real)
    const mockPool = makeMockPool();
    jest.doMock(poolPath, () => mockPool);

    // Auth mock: router.use(authenticateToken)
    jest.doMock(authPath, () => {
      return function authenticateToken(req, _res, next) {
        if (!authUser) {
          const AppError = require(appErrorPath);
          const CODES = require(errorCodesPath);
          return next(new AppError("Token não fornecido.", CODES.AUTH_ERROR, 401));
        }
        req.user = authUser;
        return next();
      };
    });

    const router = require(routerPath);
    pool = require(poolPath);

    app = makeTestApp("/api/users/addresses", router);
    return { app, pool };
  }

  beforeEach(() => {
    loadAppWithMocks();
  });

  // ------------------------------------------------------------------
  // GET /
  // ------------------------------------------------------------------
  describe("GET /api/users/addresses", () => {
    test("200 lista endereços do usuário autenticado", async () => {
      // Arrange
      pool.query.mockResolvedValueOnce([
        [
          {
            id: 10,
            apelido: "Casa",
            cep: "36900070",
            endereco: "Rua A",
            numero: "10",
            bairro: "Centro",
            cidade: "Manhuaçu",
            estado: "MG",
            complemento: null,
            ponto_referencia: null,
            telefone: null,
            is_default: 1,
            tipo_localidade: "URBANA",
            comunidade: null,
            observacoes_acesso: null,
          },
        ],
      ]);

      // Act
      const res = await request(app).get("/api/users/addresses");

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 10,
        cep: "36900070",
        tipo_localidade: "URBANA",
        is_default: 1,
      });

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(String(sql)).toContain("FROM enderecos_usuario");
      expect(String(sql)).toContain("WHERE usuario_id = ?");
      expect(params).toEqual([7]);
    });

    test("500 quando pool.query falha (SERVER_ERROR)", async () => {
      // Arrange
      pool.query.mockRejectedValueOnce(new Error("db down"));

      // Act
      const res = await request(app).get("/api/users/addresses");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: "SERVER_ERROR",
        message: "Erro ao listar endereços.",
      });
    });
  });

  // ------------------------------------------------------------------
  // POST /
  // ------------------------------------------------------------------
  describe("POST /api/users/addresses", () => {
    test("401 quando não autenticado", async () => {
      // Arrange
      loadAppWithMocks({ authUser: null });

      // Act
      const res = await request(app).post("/api/users/addresses").send({});

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");
    });

    test("400 valida campos comuns (cep/cidade/estado)", async () => {
      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "URBANA",
        endereco: "Rua A",
        bairro: "Centro",
        numero: "10",
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("cep é obrigatório");
      expect(String(res.body.message)).toContain("cidade é obrigatória");
      expect(String(res.body.message)).toContain("estado é obrigatório");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400 URBANA exige endereco+bairro+numero (quando sem_numero=false)", async () => {
      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "URBANA",
        cep: "36940-000",
        cidade: "Manhuaçu",
        estado: "mg",
        endereco: "",
        bairro: "",
        numero: "",
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("endereco (ou rua/logradouro) é obrigatório");
      expect(String(res.body.message)).toContain("bairro é obrigatório");
      expect(String(res.body.message)).toContain("numero é obrigatório");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("201 URBANA: sem_numero=true salva numero='S/N' e normaliza CEP/UF", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query
        .mockResolvedValueOnce([{}]) // UPDATE default (se is_default=true) => aqui não vai chamar
        .mockResolvedValueOnce([{}]); // INSERT

      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "URBANA",
        apelido: "Casa",
        cep: "36940-000",
        cidade: "Manhuaçu",
        estado: "mg",
        rua: "Rua das Flores", // alias -> endereco
        bairro: "Centro",
        sem_numero: true,
        // numero ausente
        complemento: "Apto 2", // é salvo como complemento também
        referencia: "Perto da praça", // alias -> ponto_referencia
        telefone: "(33) 99999-9999",
        is_default: 0,
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);

      // Como is_default=0, não deve desmarcar outros
      const calls = conn.query.mock.calls;
      const insertCall = calls.find((c) => String(c[0]).includes("INSERT INTO enderecos_usuario"));
      expect(insertCall).toBeTruthy();

      // Verifica params principais (posições fixas do INSERT)
      const params = insertCall[1];
      expect(params[0]).toBe(7); // userId
      expect(params[1]).toBe("Casa"); // apelido
      expect(params[2]).toBe("36940000"); // cep normalizado
      expect(params[3]).toBe("Rua das Flores"); // endereco
      expect(params[4]).toBe("S/N"); // numero
      expect(params[5]).toBe("Centro"); // bairro
      expect(params[6]).toBe("Manhuaçu"); // cidade
      expect(params[7]).toBe("MG"); // estado upper
      expect(params[8]).toBe("Apto 2"); // complemento
      expect(params[9]).toBe("Perto da praça"); // ponto_referencia (referencia)
      expect(params[10]).toBe("(33) 99999-9999"); // telefone
      expect(params[11]).toBe(0); // is_default 0/1
      expect(params[12]).toBe("URBANA");
      expect(params[13]).toBeNull(); // comunidade
      expect(params[14]).toBeNull(); // observacoes_acesso
    });

    test("201 RURAL: aceita comunidade e observacoes_acesso e cria placeholders defensivos", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([{}]); // INSERT

      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "RURAL",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        comunidade: "Córrego São José",
        observacoes_acesso: "Estrada de terra, após a ponte",
        // sem endereco/bairro/numero => placeholders
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });

      const insertCall = conn.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO enderecos_usuario"));
      const params = insertCall[1];

      // endereco/bairro/numero placeholders para DB legado
      expect(params[3]).toBe("Córrego São José"); // enderecoDb = comunidade
      expect(params[4]).toBe("S/N"); // numeroDb
      expect(params[5]).toBe("RURAL"); // bairroDb

      expect(params[12]).toBe("RURAL");
      expect(params[13]).toBe("Córrego São José"); // comunidade
      expect(params[14]).toBe("Estrada de terra, após a ponte"); // observacoes_acesso
    });

    test("400 RURAL exige comunidade e (observacoes_acesso ou ponto_referencia/referencia)", async () => {
      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "RURAL",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        comunidade: "",
        // sem observacoes_acesso e sem referencia/ponto_referencia
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(String(res.body.message)).toContain("comunidade é obrigatória");
      expect(String(res.body.message)).toContain("observacoes_acesso");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("POST com is_default=true desmarca outros antes do INSERT", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query
        .mockResolvedValueOnce([{}]) // UPDATE set is_default=0
        .mockResolvedValueOnce([{}]); // INSERT

      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "URBANA",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        endereco: "Rua A",
        bairro: "Centro",
        numero: "10",
        is_default: 1,
      });

      // Assert
      expect(res.status).toBe(201);
      expect(conn.query).toHaveBeenCalledTimes(2);

      expect(String(conn.query.mock.calls[0][0])).toContain("UPDATE enderecos_usuario SET is_default = 0");
      expect(conn.query.mock.calls[0][1]).toEqual([7]);
    });

    test("500 em erro dentro da transação faz rollback", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query.mockRejectedValueOnce(new Error("insert fail")); // falha no INSERT
      // Nota: o código faz rollback no catch interno

      // Act
      const res = await request(app).post("/api/users/addresses").send({
        tipo_localidade: "URBANA",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        endereco: "Rua A",
        bairro: "Centro",
        numero: "10",
      });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: "SERVER_ERROR",
        message: "Erro ao criar endereço.",
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------
  // PUT /:id
  // ------------------------------------------------------------------
  describe("PUT /api/users/addresses/:id", () => {
    test("400 id inválido", async () => {
      // Act
      const res = await request(app).put("/api/users/addresses/0").send({});

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "ID inválido." });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400 validação falha (URBANA)", async () => {
      // Act
      const res = await request(app).put("/api/users/addresses/10").send({
        tipo_localidade: "URBANA",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        endereco: "",
        bairro: "",
        numero: "",
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("404 quando endereço não pertence ao usuário (affectedRows=0) -> rollback", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      // default reset pode ocorrer se is_default=true; aqui não
      conn.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // UPDATE enderecos_usuario ... WHERE id AND usuario_id

      // Act
      const res = await request(app).put("/api/users/addresses/999").send({
        tipo_localidade: "URBANA",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        endereco: "Rua A",
        bairro: "Centro",
        numero: "10",
        is_default: 0,
      });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Endereço não encontrado." });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 atualiza e, se is_default=true, desmarca outros antes", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([{}]) // UPDATE set is_default=0
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE address ok

      // Act
      const res = await request(app).put("/api/users/addresses/10").send({
        tipo_localidade: "URBANA",
        cep: "36940-000",
        cidade: "Manhuaçu",
        estado: "mg",
        logradouro: "Rua X",
        bairro: "Centro",
        numero: "22",
        is_default: true,
      });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();

      // Primeiro call desmarca defaults
      expect(String(conn.query.mock.calls[0][0])).toContain("UPDATE enderecos_usuario SET is_default = 0");
      expect(conn.query.mock.calls[0][1]).toEqual([7]);

      // Segundo call: UPDATE do address
      const updateCall = conn.query.mock.calls[1];
      expect(String(updateCall[0])).toContain("UPDATE enderecos_usuario");
      // valida que WHERE id AND usuario_id recebeu (10, 7)
      const params = updateCall[1];
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(7);

      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("500 em erro no UPDATE faz rollback", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockRejectedValueOnce(new Error("update fail"));

      // Act
      const res = await request(app).put("/api/users/addresses/10").send({
        tipo_localidade: "URBANA",
        cep: "36940000",
        cidade: "Manhuaçu",
        estado: "MG",
        endereco: "Rua A",
        bairro: "Centro",
        numero: "10",
      });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: "SERVER_ERROR", message: "Erro ao atualizar endereço." });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------
  // DELETE /:id
  // ------------------------------------------------------------------
  describe("DELETE /api/users/addresses/:id", () => {
    test("404 quando não encontrado (affectedRows=0)", async () => {
      // Arrange
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      // Act
      const res = await request(app).delete("/api/users/addresses/10");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Endereço não encontrado." });
      expect(pool.query).toHaveBeenCalledWith(
        "DELETE FROM enderecos_usuario WHERE id = ? AND usuario_id = ?",
        [10, 7]
      );
    });

    test("200 remove com sucesso", async () => {
      // Arrange
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Act
      const res = await request(app).delete("/api/users/addresses/10");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(pool.query).toHaveBeenCalledWith(
        "DELETE FROM enderecos_usuario WHERE id = ? AND usuario_id = ?",
        [10, 7]
      );
    });

    test("500 em erro inesperado (SERVER_ERROR)", async () => {
      // Arrange
      pool.query.mockRejectedValueOnce(new Error("db fail"));

      // Act
      const res = await request(app).delete("/api/users/addresses/10");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: "SERVER_ERROR", message: "Erro ao remover endereço." });
    });
  });
});
