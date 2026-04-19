const express = require("express");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DIZIN YAPISI ────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── VERİTABANI ──────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, "urunler.db"));

db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS urunler (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    urun        TEXT,
    link        TEXT,
    gorsel      TEXT,
    nis         TEXT,
    tip         TEXT,
    durum       TEXT DEFAULT 'Araştırılıyor',
    kaynak      TEXT,
    fomo        TEXT,
    rakip       TEXT,
    kreatif     TEXT,
    breakeven   TEXT,
    fiyat       TEXT,
    alis_fiyat  TEXT,
    notlar      TEXT,
    olusturma   DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncelleme  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rakip_magazalar (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    urun_id     INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
    url         TEXT,
    ulkeler     TEXT,
    notlar      TEXT
  );

  CREATE TABLE IF NOT EXISTS gorseller (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    urun_id     INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
    dosya_adi   TEXT NOT NULL,
    aciklama    TEXT,
    yuklenme    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kullanicilar (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    isim        TEXT NOT NULL,
    renk        TEXT DEFAULT '#4F46E5',
    olusturma   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS aktivite (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    eylem       TEXT,
    urun_adi    TEXT,
    zaman       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Varsayılan kullanıcı
if (db.prepare("SELECT COUNT(*) as c FROM kullanicilar").get().c === 0) {
  db.prepare("INSERT INTO kullanicilar (isim, renk) VALUES (?,?)").run("Egemen", "#4f7cff"); insert.run("Tuna", "#ff5733");
  insert.run("Arda", "#33ff57");
  insert.run("Melisa", "#f333ff");
  insert.run("TEST Kullanıcısıı", "#ffffff");
}

// ─── MULTER (Görsel Yükleme) ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error("Sadece görsel dosyaları kabul edilir"), ok);
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── YARDIMCI: ürünle birlikte rakip + görsel çek ─────────────
function getUrunFull(id) {
  const u = db.prepare("SELECT * FROM urunler WHERE id=?").get(id);
  if (!u) return null;
  u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=? ORDER BY id").all(id);
  u.gorseller = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(id);
  return u;
}

// ─── ÜRÜNLER ─────────────────────────────────────────────────
app.get("/api/urunler", (req, res) => {
  const { nis, tip, durum, arama } = req.query;
  let sql = "SELECT * FROM urunler WHERE 1=1";
  const p = [];
  if (nis)   { sql += " AND nis=?";    p.push(nis); }
  if (tip)   { sql += " AND tip=?";    p.push(tip); }
  if (durum) { sql += " AND durum=?";  p.push(durum); }
  if (arama) { sql += " AND (urun LIKE ? OR notlar LIKE ?)"; p.push(`%${arama}%`, `%${arama}%`); }
  sql += " ORDER BY olusturma DESC";
  const rows = db.prepare(sql).all(...p);
  rows.forEach(u => {
    u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=?").all(u.id);
    u.gorseller = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(u.id);
  });
  res.json(rows);
});

app.get("/api/urunler/:id", (req, res) => {
  const u = getUrunFull(req.params.id);
  u ? res.json(u) : res.status(404).json({ error: "Bulunamadı" });
});

app.post("/api/urunler", (req, res) => {
  const { urun, link, gorsel, nis, tip, durum, kaynak, fomo, rakip, kreatif, breakeven, fiyat, alis_fiyat, notlar, rakip_magazalar, kullanici_id } = req.body;
  const result = db.prepare(`
    INSERT INTO urunler (urun,link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,alis_fiyat,notlar)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(urun,link,gorsel,nis,tip,durum||"Araştırılıyor",kaynak,fomo,rakip,kreatif,breakeven,fiyat,alis_fiyat,notlar);

  const uid = result.lastInsertRowid;
  if (Array.isArray(rakip_magazalar)) {
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(r => ins.run(uid, r.url, JSON.stringify(r.ulkeler||[]), r.notlar||""));
  }
  if (kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"ekledi",urun);
  res.json({ id: uid, message: "Eklendi" });
});

app.put("/api/urunler/:id", (req, res) => {
  const { urun, link, gorsel, nis, tip, durum, kaynak, fomo, rakip, kreatif, breakeven, fiyat, alis_fiyat, notlar, rakip_magazalar, kullanici_id } = req.body;
  db.prepare(`
    UPDATE urunler SET urun=?,link=?,gorsel=?,nis=?,tip=?,durum=?,kaynak=?,fomo=?,rakip=?,kreatif=?,breakeven=?,fiyat=?,alis_fiyat=?,notlar=?,guncelleme=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(urun,link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,alis_fiyat,notlar,req.params.id);

  if (Array.isArray(rakip_magazalar)) {
    db.prepare("DELETE FROM rakip_magazalar WHERE urun_id=?").run(req.params.id);
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(r => ins.run(req.params.id, r.url, JSON.stringify(r.ulkeler||[]), r.notlar||""));
  }
  if (kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"güncelledi",urun);
  res.json({ message: "Güncellendi" });
});

app.delete("/api/urunler/:id", (req, res) => {
  const u = db.prepare("SELECT urun FROM urunler WHERE id=?").get(req.params.id);
  // Görselleri diskten sil
  const gorseller = db.prepare("SELECT dosya_adi FROM gorseller WHERE urun_id=?").all(req.params.id);
  gorseller.forEach(g => {
    const fp = path.join(UPLOADS_DIR, g.dosya_adi);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  db.prepare("DELETE FROM urunler WHERE id=?").run(req.params.id);
  const { kullanici_id } = req.body || {};
  if (kullanici_id && u) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"sildi",u.urun);
  res.json({ message: "Silindi" });
});

// ─── GÖRSEL YÜKLEME ───────────────────────────────────────────
app.post("/api/urunler/:id/gorseller", upload.array("gorseller", 50), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: "Dosya yok" });
  const ins = db.prepare("INSERT INTO gorseller (urun_id,dosya_adi,aciklama) VALUES (?,?,?)");
  const aciklama = req.body.aciklama || "";
  const eklenen = req.files.map(f => {
    const r = ins.run(req.params.id, f.filename, aciklama);
    return { id: r.lastInsertRowid, dosya_adi: f.filename, url: `/uploads/${f.filename}` };
  });
  res.json({ eklenen });
});

app.delete("/api/gorseller/:id", (req, res) => {
  const g = db.prepare("SELECT dosya_adi FROM gorseller WHERE id=?").get(req.params.id);
  if (!g) return res.status(404).json({ error: "Bulunamadı" });
  const fp = path.join(UPLOADS_DIR, g.dosya_adi);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare("DELETE FROM gorseller WHERE id=?").run(req.params.id);
  res.json({ message: "Silindi" });
});

// ─── İSTATİSTİKLER ───────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  res.json({
    total:          db.prepare("SELECT COUNT(*) as c FROM urunler").get().c,
    onaylanan:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE durum='Onaylandı'").get().c,
    fomo_evet:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE fomo='Evet'").get().c,
    breakeven_evet: db.prepare("SELECT COUNT(*) as c FROM urunler WHERE breakeven='Evet'").get().c,
    nis_dagilim:    db.prepare("SELECT nis, COUNT(*) as c FROM urunler WHERE nis!='' GROUP BY nis ORDER BY c DESC").all(),
    durum_dagilim:  db.prepare("SELECT durum, COUNT(*) as c FROM urunler GROUP BY durum ORDER BY c DESC").all(),
    son_aktivite:   db.prepare(`
      SELECT a.eylem,a.urun_adi,a.zaman,k.isim,k.renk
      FROM aktivite a LEFT JOIN kullanicilar k ON a.kullanici_id=k.id
      ORDER BY a.zaman DESC LIMIT 15
    `).all()
  });
});

// ─── KULLANICILAR ─────────────────────────────────────────────
app.get("/api/kullanicilar", (req, res) => res.json(db.prepare("SELECT * FROM kullanicilar").all()));
app.post("/api/kullanicilar", (req, res) => {
  const { isim, renk } = req.body;
  const r = db.prepare("INSERT INTO kullanicilar (isim,renk) VALUES (?,?)").run(isim, renk||"#4f7cff");
  res.json({ id: r.lastInsertRowid });
});

// ─── CSV EXPORT ───────────────────────────────────────────────
app.get("/api/export/csv", (req, res) => {
  const urunler = db.prepare("SELECT * FROM urunler ORDER BY olusturma DESC").all();
  const hdr = ["ID","Ürün","Link","Niş","Tip","Durum","Kaynak","FOMO","Rakip Süresi","Kreatif","1:6","Fiyat","Alış","Notlar","Oluşturma"];
  const rows = urunler.map(u => [u.id,u.urun,u.link,u.nis,u.tip,u.durum,u.kaynak,u.fomo,u.rakip,u.kreatif,u.breakeven,u.fiyat,u.alis_fiyat,u.notlar,u.olusturma]);
  const csv = [hdr,...rows].map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type","text/csv;charset=utf-8");
  res.setHeader("Content-Disposition",`attachment;filename="urunler-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send("\ufeff"+csv);
});

// SPA fallback
app.get("*", (req, res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => console.log(`✓ http://localhost:${PORT}`));
