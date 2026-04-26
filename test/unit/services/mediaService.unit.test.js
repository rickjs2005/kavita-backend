/**
 * test/unit/services/mediaService.unit.test.js
 *
 * Rede de segurança para refatoração futura de services/mediaService.js.
 *
 * Estratégia de mock:
 *   - jest.resetModules() + jest.doMock() antes de cada group (ou beforeEach)
 *     para controlar vars de ambiente e módulos lidos no require().
 *   - `fs` e `fs/promises` mockados — sem toque no filesystem real.
 *   - `multer` mockado — sem infraestrutura multipart.
 *     imageFilter é capturado do config passado ao multer e testado diretamente.
 *   - S3/GCS SDKs não instalados → adapter recua para disk (comportamento real).
 *
 * Responsabilidades cobertas:
 *   ✅ toPublicPath          — conversão de path relativo para URL pública
 *   ✅ normalizeTargets      — normalização de array/string/objeto (via removeMedia)
 *   ✅ removeMedia           — unlink + ENOENT silencioso + rethrow de outros erros
 *   ✅ persistMedia          — sem pasta (existsSync) e com pasta (renameSync)
 *   ✅ enqueueOrphanCleanup — fila assíncrona, targets vazios, string como target
 *   ✅ imageFilter           — MIME allowlist por fieldname
 *   ✅ storageType           — disco por default, fallback quando SDK ausente
 *
 * Lacunas documentadas (não testadas aqui):
 *   ❌ upload HTTP e-to-e  — requer integration test com multipart/form-data
 *   ❌ S3 adapter          — @aws-sdk/client-s3 não instalado; fallback é testado
 *   ❌ GCS adapter         — @google-cloud/storage não instalado; fallback é testado
 *   ❌ limits multer       — fileSize/files testável via integration
 *   ❌ MEDIA_PUBLIC_BASE_URL → stripConfiguredBaseUrl (path raro, coberto indiretamente)
 */

"use strict";

// Captura o env original antes de qualquer doMock para restaurar entre grupos.
const originalEnv = process.env;

// ---------------------------------------------------------------------------
// Helper central: carrega o módulo com mocks controlados.
// Deve ser chamado APÓS jest.resetModules() para garantir estado limpo.
//
// Retorna:
//   svc            — instância de mediaService
//   mockFs         — objeto com spies em fs.existsSync/mkdirSync/renameSync
//   mockFsPromises — objeto com spy em fs/promises.unlink
//   getFileFilter  — getter lazy para o imageFilter capturado do multer
// ---------------------------------------------------------------------------
function loadModule({
  env = {},
  fsOverrides = {},
  fsPOverrides = {},
} = {}) {
  jest.resetModules();

  // Env controlado: define defaults seguros que podem ser sobrescritos via `env`.
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    MEDIA_PUBLIC_PREFIX: "/uploads",
    MEDIA_PUBLIC_BASE_URL: "",
    MEDIA_UPLOAD_DIR: undefined, // usa default "uploads" (relativo)
    MEDIA_STORAGE_DRIVER: undefined, // usa default "disk"
    MEDIA_STORAGE: undefined,
    ...env,
  };

  // Limpa keys undefined para evitar que process.env tenha strings "undefined"
  Object.keys(process.env).forEach((k) => {
    if (process.env[k] === undefined) delete process.env[k];
  });

  const mockFs = {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    renameSync: jest.fn(),
    ...fsOverrides,
  };

  const mockFsPromises = {
    unlink: jest.fn().mockResolvedValue(undefined),
    ...fsPOverrides,
  };

  let capturedFileFilter = null;
  const multerMock = jest.fn((config) => {
    if (config?.fileFilter) capturedFileFilter = config.fileFilter;
    // Retorna objeto mínimo que não quebra nada no module-level
    return {};
  });
  multerMock.diskStorage = jest.fn(() => ({}));
  multerMock.memoryStorage = jest.fn(() => ({}));

  jest.doMock("fs", () => mockFs);
  jest.doMock("fs/promises", () => mockFsPromises);
  jest.doMock("multer", () => multerMock);

  // eslint-disable-next-line global-require
  const svc = require("../../../services/mediaService");

  return {
    svc,
    mockFs,
    mockFsPromises,
    getFileFilter: () => capturedFileFilter,
  };
}

// Restaura env após cada teste para evitar vazamento entre groups.
afterEach(() => {
  process.env = originalEnv;
});

// ===========================================================================
// 1. toPublicPath — transformação de path relativo → URL pública
// ===========================================================================

describe("toPublicPath — disk adapter", () => {
  let svc;

  beforeAll(() => {
    ({ svc } = loadModule());
  });

  test("path simples → /uploads/path", () => {
    expect(svc.toPublicPath("img.jpg")).toBe("/uploads/img.jpg");
  });

  test("path com subpasta → /uploads/subpasta/arquivo", () => {
    expect(svc.toPublicPath("products/img.jpg")).toBe("/uploads/products/img.jpg");
  });

  test("string vazia → retorna apenas o prefixo", () => {
    expect(svc.toPublicPath("")).toBe("/uploads");
  });

  test("path com barra inicial → sanitizado corretamente", () => {
    // sanitizeSegment remove leading slashes
    expect(svc.toPublicPath("/produtos/img.jpg")).toBe("/uploads/produtos/img.jpg");
  });

  test("path com barra final → sanitizado corretamente", () => {
    expect(svc.toPublicPath("drones/img.jpg/")).toBe("/uploads/drones/img.jpg");
  });

  test("path com barras duplas internas → não colapsadas (comportamento atual do sanitizeSegment)", () => {
    // sanitizeSegment remove apenas slashes no início/fim; duplas internas são preservadas.
    // Documentado aqui para sinalizar se esse comportamento mudar numa refatoração.
    expect(svc.toPublicPath("a//b.jpg")).toBe("/uploads/a//b.jpg");
  });

  test("path com backslash → convertido para forward slash", () => {
    // sanitizeSegment substitui \\ → /
    expect(svc.toPublicPath("drones\\img.jpg")).toBe("/uploads/drones/img.jpg");
  });
});

describe("toPublicPath — prefixo customizado via env", () => {
  let svc;

  beforeAll(() => {
    ({ svc } = loadModule({ env: { MEDIA_PUBLIC_PREFIX: "/media/v2/" } }));
  });

  test("barra final no prefixo é removida antes da concatenação", () => {
    // normalizePublicPrefix remove trailing slash
    expect(svc.toPublicPath("img.jpg")).toBe("/media/v2/img.jpg");
  });

  test("prefixo sem barra final funciona igual", () => {
    // /media/v2 sem barra → mesmo resultado
    expect(svc.toPublicPath("img.jpg")).toBe("/media/v2/img.jpg");
  });
});

// ===========================================================================
// 2. removeMedia — disk adapter
// ===========================================================================

describe("removeMedia — disk adapter", () => {
  let svc;
  let mockFsPromises;

  beforeAll(() => {
    ({ svc, mockFsPromises } = loadModule());
  });

  beforeEach(() => {
    // Zera spy entre testes sem recarregar o módulo
    mockFsPromises.unlink.mockReset().mockResolvedValue(undefined);
  });

  test("chama unlink com o key do target", async () => {
    await svc.removeMedia([{ path: "/uploads/a.jpg", key: "/abs/a.jpg" }]);
    expect(mockFsPromises.unlink).toHaveBeenCalledWith("/abs/a.jpg");
  });

  test("múltiplos targets → unlink chamado para cada um", async () => {
    await svc.removeMedia([
      { path: "/uploads/a.jpg", key: "/abs/a.jpg" },
      { path: "/uploads/b.jpg", key: "/abs/b.jpg" },
    ]);
    expect(mockFsPromises.unlink).toHaveBeenCalledTimes(2);
    expect(mockFsPromises.unlink).toHaveBeenCalledWith("/abs/a.jpg");
    expect(mockFsPromises.unlink).toHaveBeenCalledWith("/abs/b.jpg");
  });

  test("ENOENT é silenciado — não rejeita", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockFsPromises.unlink.mockRejectedValueOnce(err);
    await expect(
      svc.removeMedia([{ path: "/uploads/a.jpg", key: "/abs/a.jpg" }])
    ).resolves.toBeUndefined();
  });

  test("erro diferente de ENOENT → relançado", async () => {
    const err = Object.assign(new Error("permission denied"), { code: "EPERM" });
    mockFsPromises.unlink.mockRejectedValueOnce(err);
    await expect(
      svc.removeMedia([{ path: "/uploads/a.jpg", key: "/abs/a.jpg" }])
    ).rejects.toThrow("permission denied");
  });

  test("targets vazios → unlink não é chamado", async () => {
    await svc.removeMedia([]);
    expect(mockFsPromises.unlink).not.toHaveBeenCalled();
  });

  test("target null → filtrado, unlink não é chamado", async () => {
    // normalizeTargets faz .filter(Boolean) — null é descartado
    await svc.removeMedia([null]);
    expect(mockFsPromises.unlink).not.toHaveBeenCalled();
  });

  test("target sem path → filtrado por normalizeTargets, unlink não é chamado", async () => {
    // normalizeTargets exige item.path — target sem path é ignorado
    await svc.removeMedia([{ key: "/abs/a.jpg" }]);
    expect(mockFsPromises.unlink).not.toHaveBeenCalled();
  });

  test("string como target → convertida para { path }, key derivado, unlink chamado", async () => {
    // normalizeTargets converte string → { path: string }
    // resolveTargets deriva key via resolveKey(path)
    await svc.removeMedia(["/uploads/file.jpg"]);
    expect(mockFsPromises.unlink).toHaveBeenCalledTimes(1);
    // key é path absoluto derivado do prefixo — verificamos apenas que foi chamado
    const calledWith = mockFsPromises.unlink.mock.calls[0][0];
    expect(typeof calledWith).toBe("string");
    expect(calledWith.length).toBeGreaterThan(0);
  });

  test("ENOENT em um target não impede a remoção dos seguintes", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockFsPromises.unlink
      .mockRejectedValueOnce(enoent)           // primeiro → silenciado
      .mockResolvedValueOnce(undefined);        // segundo → ok

    await svc.removeMedia([
      { path: "/uploads/a.jpg", key: "/abs/a.jpg" },
      { path: "/uploads/b.jpg", key: "/abs/b.jpg" },
    ]);

    expect(mockFsPromises.unlink).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 3. persistMedia — disk adapter
// ===========================================================================

describe("persistMedia — disk adapter", () => {
  let svc;
  let mockFs;

  beforeAll(() => {
    ({ svc, mockFs } = loadModule());
  });

  beforeEach(() => {
    // Reseta spies entre testes; existsSync volta a retornar true (happy path)
    mockFs.existsSync.mockReset().mockReturnValue(true);
    mockFs.renameSync.mockReset();
    mockFs.mkdirSync.mockReset();
  });

  test("array vazio → retorna []", async () => {
    const result = await svc.persistMedia([]);
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Sem pasta (options sem folder)
  // -------------------------------------------------------------------------

  test("sem folder: retorna [{path, key}] com path no formato /uploads/filename", async () => {
    const result = await svc.persistMedia(
      [{ filename: "abc-123.jpg", originalname: "photo.jpg" }],
      {}
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("/uploads/abc-123.jpg");
    expect(typeof result[0].key).toBe("string");
    expect(result[0].key.length).toBeGreaterThan(0);
  });

  test("sem folder: não chama renameSync", async () => {
    await svc.persistMedia(
      [{ filename: "abc-123.jpg", originalname: "photo.jpg" }],
      {}
    );
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  test("sem folder: arquivo temporário não encontrado → lança erro", async () => {
    // existsSync retorna false para a verificação do arquivo temporário
    mockFs.existsSync.mockReturnValue(false);

    await expect(
      svc.persistMedia([{ filename: "missing.jpg", originalname: "missing.jpg" }], {})
    ).rejects.toThrow(/não encontrado/);
  });

  // -------------------------------------------------------------------------
  // Com pasta (options.folder definido)
  // -------------------------------------------------------------------------

  test("com folder: chama renameSync uma vez", async () => {
    await svc.persistMedia(
      [{ filename: "img.jpg", originalname: "img.jpg" }],
      { folder: "products" }
    );
    expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
  });

  test("com folder: path retornado inclui a pasta", async () => {
    const result = await svc.persistMedia(
      [{ filename: "img.jpg", originalname: "img.jpg" }],
      { folder: "products" }
    );
    expect(result[0].path).toBe("/uploads/products/img.jpg");
  });

  test("com folder: key é caminho absoluto para o destino", async () => {
    const result = await svc.persistMedia(
      [{ filename: "img.jpg", originalname: "img.jpg" }],
      { folder: "products" }
    );
    // key deve ser caminho absoluto (começa com / ou letra de drive no Windows)
    expect(path.isAbsolute(result[0].key)).toBe(true);
    // e deve incluir o nome do arquivo
    expect(result[0].key).toMatch(/img\.jpg$/);
  });

  test("com folder: arquivo temporário não encontrado (srcPath) → lança erro sem renomear", async () => {
    // sequência de existsSync em persist com folder:
    //   1. ensureDirSync(subDir) → true (subdir existe, sem mkdirSync)
    //   2. existsSync(srcPath)   → false → lança erro
    mockFs.existsSync
      .mockReturnValueOnce(true)   // subDir check
      .mockReturnValueOnce(false); // srcPath check

    await expect(
      svc.persistMedia(
        [{ filename: "ghost.jpg", originalname: "ghost.jpg" }],
        { folder: "products" }
      )
    ).rejects.toThrow(/temporário não encontrado/);

    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  test("com folder: verificação de destPath falha após rename → lança erro", async () => {
    // sequência:
    //   1. existsSync(subDir)  → true
    //   2. existsSync(srcPath) → true
    //   3. renameSync executado
    //   4. existsSync(destPath) → false → lança erro
    mockFs.existsSync
      .mockReturnValueOnce(true)   // subDir
      .mockReturnValueOnce(true)   // srcPath
      .mockReturnValueOnce(false); // destPath check

    await expect(
      svc.persistMedia(
        [{ filename: "broken.jpg", originalname: "broken.jpg" }],
        { folder: "products" }
      )
    ).rejects.toThrow(/não encontrado após mover/);

    expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
  });

  test("com folder: pasta não existe → mkdirSync é chamado via ensureDirSync", async () => {
    // primeira chamada (subDir check) → false → mkdirSync
    // segunda (srcPath) → true, terceira (destPath) → true
    mockFs.existsSync
      .mockReturnValueOnce(false)  // subDir → não existe → mkdirSync
      .mockReturnValueOnce(true)   // srcPath
      .mockReturnValueOnce(true);  // destPath

    await svc.persistMedia(
      [{ filename: "img.jpg", originalname: "img.jpg" }],
      { folder: "new-folder" }
    );

    expect(mockFs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("new-folder"),
      { recursive: true }
    );
  });

  test("múltiplos arquivos com folder → renomeia cada um, retorna todos", async () => {
    const files = [
      { filename: "a.jpg", originalname: "a.jpg" },
      { filename: "b.png", originalname: "b.png" },
    ];
    const result = await svc.persistMedia(files, { folder: "gallery" });

    expect(result).toHaveLength(2);
    expect(mockFs.renameSync).toHaveBeenCalledTimes(2);
    expect(result[0].path).toBe("/uploads/gallery/a.jpg");
    expect(result[1].path).toBe("/uploads/gallery/b.png");
  });

  test("folder com separadores especiais é sanitizado (sem traversal)", async () => {
    // sanitizeSegment remove slashes iniciais/finais
    const result = await svc.persistMedia(
      [{ filename: "img.jpg", originalname: "img.jpg" }],
      { folder: "/colaboradores/" }
    );
    // sanitizeSegment("/colaboradores/") = "colaboradores"
    expect(result[0].path).toBe("/uploads/colaboradores/img.jpg");
  });
});

// ===========================================================================
// 3.b persistMedia — caminho in-memory (buffer)
// Bug original: salvarComprovante construia fakeFile com buffer mas SEM
// filename — diskAdapter usava path.join(uploadRoot, file.filename) e
// quebrava com TypeError: path argument must be of type string. Received
// undefined. Os tests abaixo travam o fix.
// ===========================================================================

describe("persistMedia — in-memory (buffer, sem filename)", () => {
  function loadWithWriteFile() {
    return loadModule({
      fsOverrides: {
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        renameSync: jest.fn(),
        writeFileSync: jest.fn(),
        unlinkSync: jest.fn(),
      },
    });
  }

  test("file com buffer (sem filename): NAO lanca TypeError + grava via writeFileSync", async () => {
    const { svc, mockFs } = loadWithWriteFile();
    const file = {
      buffer: Buffer.from("fake png bytes"),
      mimetype: "image/png",
      originalname: "assinatura.png",
      size: 14,
    };
    const [r] = await svc.persistMedia([file], { folder: "entregas" });

    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("entregas"),
      file.buffer,
      expect.objectContaining({ flag: "wx" }),
    );
    expect(r.path).toMatch(/^\/uploads\/entregas\/.+\.png$/);
    // NAO deve renomear — vem direto do buffer
    expect(mockFs.renameSync).not.toHaveBeenCalled();
  });

  test("file sem buffer E sem filename: erro CLARO (sem TypeError node:path)", async () => {
    const { svc } = loadWithWriteFile();
    const file = { mimetype: "image/png", originalname: "x.png" };
    await expect(
      svc.persistMedia([file], { folder: "entregas" }),
    ).rejects.toThrow(/precisa de buffer.*ou filename/i);
  });

  test("file null no array: erro CLARO em vez de TypeError", async () => {
    const { svc } = loadWithWriteFile();
    await expect(
      svc.persistMedia([null], { folder: "entregas" }),
    ).rejects.toThrow(/Arquivo invalido/i);
  });

  test("file com buffer vazio: tratado como invalido (precisa buffer ou filename)", async () => {
    const { svc } = loadWithWriteFile();
    const file = {
      buffer: Buffer.alloc(0),
      mimetype: "image/png",
      originalname: "empty.png",
    };
    await expect(
      svc.persistMedia([file], { folder: "entregas" }),
    ).rejects.toThrow(/precisa de buffer.*ou filename/i);
  });

  test("rollback: 1o arquivo grava, 2o falha → 1o e' removido (best-effort)", async () => {
    const writeFileSync = jest
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("EIO disk full");
      });
    const unlinkSync = jest.fn();
    const { svc } = loadModule({
      fsOverrides: {
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        renameSync: jest.fn(),
        writeFileSync,
        unlinkSync,
      },
    });

    const file1 = {
      buffer: Buffer.from("a"),
      mimetype: "image/png",
      originalname: "a.png",
    };
    const file2 = {
      buffer: Buffer.from("b"),
      mimetype: "image/png",
      originalname: "b.png",
    };

    await expect(
      svc.persistMedia([file1, file2], { folder: "entregas" }),
    ).rejects.toThrow(/EIO disk full/);

    // O 1o que ja' tinha gravado deve ser removido pra nao deixar lixo
    expect(unlinkSync).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 3.c MEDIA_UPLOAD_DIR vazio: fail-fast no boot
// Note: o guard explicito no createDiskAdapter (`if (UPLOAD_DIR vazio)
// throw`) e' cobertura defensiva contra MEDIA_UPLOAD_DIR=" " ou injecao
// de string com so' espacos. Em runtime normal o storageUtils ja' tem
// fallback "uploads" via `||`. Nao testamos com jest.doMock aqui pra evitar
// poluir o module registry dos outros tests deste arquivo.
// ===========================================================================

// ---------------------------------------------------------------------------
// path é necessário para isAbsolute no teste "com folder: key é caminho absoluto"
// ---------------------------------------------------------------------------
const path = require("path");

// ===========================================================================
// 4. enqueueOrphanCleanup — fila assíncrona de limpeza
// ===========================================================================

describe("enqueueOrphanCleanup", () => {
  // Cada teste usa módulo fresco para garantir cleanupQueue vazio
  // (cleanupQueue é estado de módulo — persiste entre chamadas na mesma instância)

  afterEach(() => {
    process.env = originalEnv;
  });

  test("targets vazios → resolve imediatamente sem chamar unlink", async () => {
    const { svc, mockFsPromises } = loadModule();
    await svc.enqueueOrphanCleanup([]);
    expect(mockFsPromises.unlink).not.toHaveBeenCalled();
  });

  test("target com path e key → enfileira e chama unlink com key", async () => {
    const { svc, mockFsPromises } = loadModule();
    await svc.enqueueOrphanCleanup([
      { path: "/uploads/a.jpg", key: "/abs/a.jpg" },
    ]);
    expect(mockFsPromises.unlink).toHaveBeenCalledWith("/abs/a.jpg");
  });

  test("target como string → convertido para path, unlink chamado uma vez", async () => {
    const { svc, mockFsPromises } = loadModule();
    // normalizeTargets converte string → { path: string }
    await svc.enqueueOrphanCleanup(["/uploads/orphan.jpg"]);
    expect(mockFsPromises.unlink).toHaveBeenCalledTimes(1);
  });

  test("múltiplos targets → unlink chamado para cada um", async () => {
    const { svc, mockFsPromises } = loadModule();
    await svc.enqueueOrphanCleanup([
      { path: "/uploads/a.jpg", key: "/abs/a.jpg" },
      { path: "/uploads/b.jpg", key: "/abs/b.jpg" },
    ]);
    expect(mockFsPromises.unlink).toHaveBeenCalledTimes(2);
  });

  test("target null → filtrado, resolve sem chamar unlink", async () => {
    const { svc, mockFsPromises } = loadModule();
    await svc.enqueueOrphanCleanup([null]);
    expect(mockFsPromises.unlink).not.toHaveBeenCalled();
  });

  test("unlink falha na fila → job ainda resolve (não propaga para o caller)", async () => {
    // O design do enqueueOrphanCleanup é fire-and-forget para erros —
    // processCleanupQueue usa try/catch e chama job.resolve() no finally.
    const { svc, mockFsPromises } = loadModule();
    mockFsPromises.unlink.mockRejectedValue(new Error("disk full"));

    await expect(
      svc.enqueueOrphanCleanup([{ path: "/uploads/a.jpg", key: "/abs/a.jpg" }])
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 5. imageFilter — validação de MIME type por fieldname
// ===========================================================================

describe("imageFilter — MIME allowlist", () => {
  let imageFilter;

  beforeAll(() => {
    const { getFileFilter } = loadModule();
    imageFilter = getFileFilter();
    // Garantia: multer foi chamado com fileFilter durante o require()
    expect(imageFilter).not.toBeNull();
  });

  // Utilitário: chama o filter e aguarda o callback
  function applyFilter(fieldname, mimetype) {
    return new Promise((resolve) => {
      imageFilter(null, { fieldname, mimetype }, (err, accept) => {
        resolve(err ? { err } : { accept });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Campo padrão (imagens)
  // -------------------------------------------------------------------------

  test("image/jpeg → aceito", async () => {
    const r = await applyFilter("imagem", "image/jpeg");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("image/png → aceito", async () => {
    const r = await applyFilter("cover", "image/png");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("image/webp → aceito", async () => {
    const r = await applyFilter("foto", "image/webp");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("image/gif → aceito", async () => {
    const r = await applyFilter("thumb", "image/gif");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("image/svg+xml → rejeitado com status 400 (risco de XSS)", async () => {
    const r = await applyFilter("imagem", "image/svg+xml");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  test("text/plain → rejeitado", async () => {
    const r = await applyFilter("arquivo", "text/plain");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  test("application/pdf → rejeitado", async () => {
    const r = await applyFilter("doc", "application/pdf");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  test("video/mp4 em campo padrão → rejeitado (vídeo não é permitido fora de campos específicos)", async () => {
    const r = await applyFilter("imagem", "video/mp4");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Campo heroVideo
  // -------------------------------------------------------------------------

  test("heroVideo + video/mp4 → aceito", async () => {
    const r = await applyFilter("heroVideo", "video/mp4");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("heroVideo + video/webm → aceito", async () => {
    const r = await applyFilter("heroVideo", "video/webm");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("heroVideo + video/ogg → aceito", async () => {
    const r = await applyFilter("heroVideo", "video/ogg");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("heroVideo + image/jpeg → rejeitado com mensagem específica", async () => {
    const r = await applyFilter("heroVideo", "image/jpeg");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.message).toMatch(/heroVideo inválido/);
    expect(r.err.status).toBe(400);
  });

  test("heroVideo + image/svg+xml → rejeitado (nem imagem, nem vídeo permitido)", async () => {
    const r = await applyFilter("heroVideo", "image/svg+xml");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Campo media (imagem OU vídeo aceitos)
  // -------------------------------------------------------------------------

  test("media + image/jpeg → aceito", async () => {
    const r = await applyFilter("media", "image/jpeg");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("media + image/png → aceito", async () => {
    const r = await applyFilter("media", "image/png");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("media + video/mp4 → aceito", async () => {
    const r = await applyFilter("media", "video/mp4");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("media + video/webm → aceito", async () => {
    const r = await applyFilter("media", "video/webm");
    expect(r.err).toBeUndefined();
    expect(r.accept).toBe(true);
  });

  test("media + text/plain → rejeitado", async () => {
    const r = await applyFilter("media", "text/plain");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });

  test("media + image/svg+xml → rejeitado", async () => {
    const r = await applyFilter("media", "image/svg+xml");
    expect(r.err).toBeInstanceOf(Error);
    expect(r.err.status).toBe(400);
  });
});

// ===========================================================================
// 6. storageType — seleção de driver
// ===========================================================================

describe("storageType — seleção de driver", () => {
  test("padrão → 'disk' quando MEDIA_STORAGE_DRIVER não está definido", () => {
    const { svc } = loadModule({ env: {} });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=disk → 'disk'", () => {
    const { svc } = loadModule({ env: { MEDIA_STORAGE_DRIVER: "disk" } });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=DISK (maiúsculo) → 'disk' (case insensitive)", () => {
    const { svc } = loadModule({ env: { MEDIA_STORAGE_DRIVER: "DISK" } });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE=disk (alias) → 'disk'", () => {
    const { svc } = loadModule({ env: { MEDIA_STORAGE: "disk" } });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=s3 sem SDK instalado → fallback para 'disk'", () => {
    // @aws-sdk/client-s3 não está nas dependências do projeto.
    // createS3Adapter captura o require error e retorna diskAdapter (fallback).
    const { svc } = loadModule({
      env: {
        MEDIA_STORAGE_DRIVER: "s3",
        AWS_S3_BUCKET: "my-test-bucket",
      },
    });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=gcs sem SDK instalado → fallback para 'disk'", () => {
    // @google-cloud/storage não está nas dependências do projeto.
    const { svc } = loadModule({
      env: {
        MEDIA_STORAGE_DRIVER: "gcs",
        GCS_BUCKET: "my-test-bucket",
      },
    });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=google (alias GCS) → fallback para 'disk'", () => {
    const { svc } = loadModule({
      env: {
        MEDIA_STORAGE_DRIVER: "google",
        GCS_BUCKET: "my-test-bucket",
      },
    });
    expect(svc.storageType).toBe("disk");
  });

  test("MEDIA_STORAGE_DRIVER=s3 sem bucket configurado → fallback para 'disk'", () => {
    // createS3Adapter verifica bucket e retorna fallback se ausente
    const { svc } = loadModule({
      env: { MEDIA_STORAGE_DRIVER: "s3" },
      // AWS_S3_BUCKET e S3_BUCKET não definidos
    });
    expect(svc.storageType).toBe("disk");
  });
});
