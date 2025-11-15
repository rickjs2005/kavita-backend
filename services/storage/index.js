const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();
const CDN_BASE_URL = process.env.STORAGE_CDN_URL || process.env.CDN_BASE_URL;
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || "media";

const loadS3 = () => {
  try {
    const mod = require("@aws-sdk/client-s3");
    return {
      S3Client: mod.S3Client,
      PutObjectCommand: mod.PutObjectCommand,
      DeleteObjectCommand: mod.DeleteObjectCommand,
    };
  } catch (err) {
    throw new Error(
      "Pacote '@aws-sdk/client-s3' é necessário para STORAGE_DRIVER=s3. Instale-o com npm install."
    );
  }
};

const loadGCS = () => {
  try {
    // eslint-disable-next-line global-require
    const { Storage } = require("@google-cloud/storage");
    return { Storage };
  } catch (err) {
    throw new Error(
      "Pacote '@google-cloud/storage' é necessário para STORAGE_DRIVER=gcs. Instale-o com npm install."
    );
  }
};

class StorageService {
  constructor() {
    if (STORAGE_DRIVER === "s3") {
      if (!process.env.AWS_S3_BUCKET) {
        throw new Error("AWS_S3_BUCKET deve ser informado quando STORAGE_DRIVER=s3");
      }
      const { S3Client, PutObjectCommand, DeleteObjectCommand } = loadS3();
      this.client = new S3Client({
        region: process.env.AWS_REGION,
        credentials:
          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
      this.s3Commands = { PutObjectCommand, DeleteObjectCommand };
      this.bucket = process.env.AWS_S3_BUCKET;
    } else if (STORAGE_DRIVER === "gcs") {
      if (!process.env.GCS_BUCKET) {
        throw new Error("GCS_BUCKET deve ser informado quando STORAGE_DRIVER=gcs");
      }
      const { Storage } = loadGCS();
      const options = {};
      if (process.env.GCP_PROJECT_ID) {
        options.projectId = process.env.GCP_PROJECT_ID;
      }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        options.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      }
      this.client = new Storage(options);
      this.bucket = this.client.bucket(process.env.GCS_BUCKET);
    } else {
      this.client = null;
      this.bucket = null;
    }
  }

  generateKey(originalName = "") {
    const safeExt = path.extname(originalName) || "";
    const key = `${STORAGE_PREFIX}/${crypto.randomUUID()}${safeExt}`;
    return key.replace(/\\+/g, "/");
  }

  toPublicUrl(key) {
    if (!key) return null;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    if (CDN_BASE_URL) {
      return `${CDN_BASE_URL.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
    }
    if (STORAGE_DRIVER === "s3") {
      const region = process.env.AWS_REGION || "us-east-1";
      return `https://${process.env.AWS_S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
    }
    if (STORAGE_DRIVER === "gcs") {
      return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${key}`;
    }
    return `/uploads/${key}`;
  }

  normalizeKey(input) {
    if (!input) return null;
    let key = input;
    if (key.startsWith("http")) {
      if (CDN_BASE_URL && key.startsWith(CDN_BASE_URL)) {
        key = key.slice(CDN_BASE_URL.length);
      } else if (STORAGE_DRIVER === "s3" && key.includes(`${process.env.AWS_S3_BUCKET}.s3`)) {
        const [, rest] = key.split(`.amazonaws.com/`);
        key = rest || key;
      } else if (STORAGE_DRIVER === "gcs" && key.includes("storage.googleapis.com")) {
        const parts = key.split(".com/");
        key = parts[1] || key;
      }
    }
    return key.replace(/^\//, "");
  }

  async uploadBuffer(buffer, originalname, mimetype) {
    if (!buffer) throw new Error("Buffer inválido para upload");
    const key = this.generateKey(originalname);

    if (STORAGE_DRIVER === "s3") {
      const { PutObjectCommand } = this.s3Commands;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
          ACL: process.env.AWS_S3_ACL || "public-read",
        })
      );
      return { key, url: this.toPublicUrl(key) };
    }

    if (STORAGE_DRIVER === "gcs") {
      const file = this.bucket.file(key);
      await file.save(buffer, {
        metadata: { contentType: mimetype },
        public: true,
      });
      return { key, url: this.toPublicUrl(key) };
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { key, url: this.toPublicUrl(key) };
  }

  async deleteFile(input) {
    const key = this.normalizeKey(input);
    if (!key) return;

    if (STORAGE_DRIVER === "s3") {
      const { DeleteObjectCommand } = this.s3Commands;
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return;
    }

    if (STORAGE_DRIVER === "gcs") {
      await this.bucket.file(key).delete({ ignoreNotFound: true });
      return;
    }

    const uploadDir = path.join(process.cwd(), "uploads", key);
    try {
      await unlink(uploadDir);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

module.exports = new StorageService();
