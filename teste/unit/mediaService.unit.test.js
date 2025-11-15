const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");

const uploadsDir = path.join(process.cwd(), "uploads");

const loadService = () => {
  const mediaService = require("../../services/mediaService");
  return mediaService;
};

const createTempFile = async (filename) => {
  const filePath = path.join(uploadsDir, filename);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, "test");
  return filePath;
};

describe("mediaService local cleanup", () => {
  const envBackup = {};

  beforeAll(async () => {
    await fsPromises.mkdir(uploadsDir, { recursive: true });
  });

  beforeEach(() => {
    envBackup.MEDIA_STORAGE_DRIVER = process.env.MEDIA_STORAGE_DRIVER;
    envBackup.MEDIA_STORAGE = process.env.MEDIA_STORAGE;
    envBackup.MEDIA_UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR;
    envBackup.MEDIA_PUBLIC_PREFIX = process.env.MEDIA_PUBLIC_PREFIX;

    process.env.MEDIA_STORAGE_DRIVER = "disk";
    process.env.MEDIA_STORAGE = "disk";
    process.env.MEDIA_UPLOAD_DIR = "uploads";
    process.env.MEDIA_PUBLIC_PREFIX = "/uploads";
  });

  afterEach(async () => {
    if (envBackup.MEDIA_STORAGE_DRIVER === undefined) {
      delete process.env.MEDIA_STORAGE_DRIVER;
    } else {
      process.env.MEDIA_STORAGE_DRIVER = envBackup.MEDIA_STORAGE_DRIVER;
    }
    if (envBackup.MEDIA_STORAGE === undefined) {
      delete process.env.MEDIA_STORAGE;
    } else {
      process.env.MEDIA_STORAGE = envBackup.MEDIA_STORAGE;
    }
    if (envBackup.MEDIA_UPLOAD_DIR === undefined) {
      delete process.env.MEDIA_UPLOAD_DIR;
    } else {
      process.env.MEDIA_UPLOAD_DIR = envBackup.MEDIA_UPLOAD_DIR;
    }
    if (envBackup.MEDIA_PUBLIC_PREFIX === undefined) {
      delete process.env.MEDIA_PUBLIC_PREFIX;
    } else {
      process.env.MEDIA_PUBLIC_PREFIX = envBackup.MEDIA_PUBLIC_PREFIX;
    }

    const files = await fsPromises.readdir(uploadsDir);
    await Promise.all(
      files
        .filter((file) => file.startsWith("test-media-"))
        .map((file) =>
          fsPromises.unlink(path.join(uploadsDir, file)).catch(() => {})
        )
    );
  });

  test("removeMedia remove arquivos locais imediatamente", async () => {
    const filename = `test-media-${Date.now()}.txt`;
    await createTempFile(filename);
    const mediaService = loadService();

    await mediaService.removeMedia([`/uploads/${filename}`]);

    expect(fs.existsSync(path.join(uploadsDir, filename))).toBe(false);
  });

  test("enqueueOrphanCleanup processa exclusão de forma assíncrona", async () => {
    const filename = `test-media-${Date.now()}-queue.txt`;
    await createTempFile(filename);
    const mediaService = loadService();

    await mediaService.enqueueOrphanCleanup([`/uploads/${filename}`]);

    expect(fs.existsSync(path.join(uploadsDir, filename))).toBe(false);
  });
});
