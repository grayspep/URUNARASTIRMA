const express = require("express");
const router = express.Router();
const { db } = require("../db");

router.get("/", (req, res) => res.json(db.prepare("SELECT * FROM kullanicilar ORDER BY id").all()));

router.post("/", (req, res) => {
  const { isim, renk } = req.body;
  if (!isim) return res.status(400).json({ error: "İsim gerekli" });
  const r = db.prepare("INSERT INTO kullanicilar (isim,renk) VALUES (?,?)").run(isim, renk||"#4f7cff");
  res.json({ id: r.lastInsertRowid });
});

module.exports = router;
