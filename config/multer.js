// backend/config/multer.ts
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Criar pasta por tipo
    const type = req.body.type || "general"; // "produto", "drone", "hero"
    const folder = path.join(__dirname, "../uploads", type);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    // Nome único
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${random}${ext}`);
  },
});

export const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido"));
    }
  },
});

// backend/routes/upload.ts
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo" });
  }

  // Retorna APENAS o caminho relativo
  const filePath = `uploads/${req.body.type}/${req.file.filename}`;
  
  res.json({
    success: true,
    path: filePath,
    url: `http://localhost:5000/${filePath}`,
  });
});