/**
 * test/unit/services/contatoService.unit.test.js
 *
 * Testa services/contatoService.js
 * - Sem MySQL real (mock do config/pool via repo)
 * - Sem envio real de email (mock do mailService)
 * - AAA: Arrange -> Act -> Assert
 */

"use strict";

describe("services/contatoService", () => {
  const repoPath = require.resolve("../../../repositories/contatoRepository");
  const mailServicePath = require.resolve("../../../services/mailService");
  const templatePath = require.resolve("../../../templates/email/confirmacaoContato");
  const loggerPath = require.resolve("../../../lib/logger");

  let svc;
  let repo;
  let sendTransactionalEmail;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(repoPath, () => ({
      create: jest.fn().mockResolvedValue({ insertId: 42 }),
      countByIpSince: jest.fn().mockResolvedValue(0),
    }));

    jest.doMock(mailServicePath, () => ({
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock(templatePath, () => () => ({
      subject: "Recebido",
      html: "<p>oi</p>",
      text: "oi",
    }));

    jest.doMock(loggerPath, () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    repo = require(repoPath);
    ({ sendTransactionalEmail } = require(mailServicePath));
    svc = require("../../../services/contatoService");
  });

  describe("createMensagem()", () => {
    const VALID = {
      nome: "Rick Sanchez",
      email: "rick@example.com",
      telefone: "31999990000",
      assunto: "Duvida sobre pedido",
      mensagem: "Quando chega meu pedido?",
      ip: "127.0.0.1",
    };

    test("payload valido → persiste e retorna { id }", async () => {
      const result = await svc.createMensagem(VALID);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 42 });
    });

    test("sanitiza campos antes de persistir", async () => {
      await svc.createMensagem({
        ...VALID,
        nome: "  <script>x</script>Rick  ",
        mensagem: "  <b>Hello</b>  ",
      });

      const args = repo.create.mock.calls[0][0];
      expect(args.nome).not.toContain("<script>");
      expect(args.nome).not.toContain("<");
      expect(args.mensagem).not.toContain("<b>");
    });

    test("dispara email de confirmacao apos persistencia", async () => {
      await svc.createMensagem(VALID);

      expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
      expect(sendTransactionalEmail).toHaveBeenCalledWith(
        "rick@example.com",
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    test("falha no email de confirmacao NAO bloqueia o retorno", async () => {
      sendTransactionalEmail.mockRejectedValueOnce(new Error("SMTP down"));

      const result = await svc.createMensagem(VALID);

      // Persistencia continua, retorno e identico
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 42 });
    });

    test("rate limit: 3 mensagens na ultima hora → throw RATE_LIMIT", async () => {
      repo.countByIpSince.mockResolvedValueOnce(3);

      await expect(svc.createMensagem(VALID)).rejects.toMatchObject({
        code: "RATE_LIMIT",
        status: 429,
      });

      // Nao deve persistir nem enviar email
      expect(repo.create).not.toHaveBeenCalled();
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
    });

    test("sem IP: nao aplica rate limit", async () => {
      const result = await svc.createMensagem({ ...VALID, ip: null });

      expect(repo.countByIpSince).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 42 });
    });

    test("telefone vazio: passa string vazia para o repo", async () => {
      await svc.createMensagem({ ...VALID, telefone: "" });

      const args = repo.create.mock.calls[0][0];
      expect(args.telefone).toBe("");
    });
  });
});
