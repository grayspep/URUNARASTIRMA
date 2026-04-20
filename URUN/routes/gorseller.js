const express = require("express");
const router = express.Router({ mergeParams: true });
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, UPLOADS_DIR } = require("../db");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error("Sadece görsel"), ok);
  }
});

// POST /api/urunler/:urun_id/gorseller
router.post("/", upload.array("gorseller", 50), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "Dosya yok" });
  const ins = db.prepare("INSERT INTO gorseller (urun_id,dosya_adi,aciklama) VALUES (?,?,?)");
  const eklenen = req.files.map(f => {
    const r = ins.run(req.params.urun_id, f.filename, req.body.aciklama||"");
    return { id: r.lastInsertRowid, dosya_adi: f.filename, url: `/uploads/${f.filename}` };
  });
  res.json({ eklenen });
});

// DELETE /api/gorseller/:id
const delRouter = express.Router();
delRouter.delete("/:id", (req, res) => {
  const g = db.prepare("SELECT dosya_adi FROM gorseller WHERE id=?").get(req.params.id);
  if (!g) return res.status(404).json({ error: "Yok" });
  try { fs.unlinkSync(path.join(UPLOADS_DIR, g.dosya_adi)); } catch(e) {}
  db.prepare("DELETE FROM gorseller WHERE id=?").run(req.params.id);
  res.json({ message: "ok" });
});

module.exports = { uploadRouter: router, deleteRouter: delRouter };
