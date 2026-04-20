const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const db = new Database(path.join(DATA_DIR, "xcommerce.db"));
db.exec("PRAGMA journal_mode=WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS urunler (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    urun          TEXT,
    link          TEXT,
    tedarik_link  TEXT,
    gorsel        TEXT,
    nis           TEXT,
    tip           TEXT,
    durum         TEXT DEFAULT 'Araştırılıyor',
    kaynak        TEXT,
    fomo          TEXT,
    rakip         TEXT,
    kreatif       TEXT,
    breakeven     TEXT,
    fiyat         TEXT,
    para_birimi   TEXT DEFAULT 'USD',
    satis_fiyat   TEXT,
    alis_fiyat    TEXT,
    notlar        TEXT,
    ai_analiz     TEXT,
    ai_tarih      DATETIME,
    olusturma     DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncelleme    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rakip_magazalar (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    urun_id  INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
    url      TEXT,
    ulkeler  TEXT,
    notlar   TEXT
  );

  CREATE TABLE IF NOT EXISTS gorseller (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    urun_id    INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
    dosya_adi  TEXT NOT NULL,
    aciklama   TEXT,
    yuklenme   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kullanicilar (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    isim      TEXT NOT NULL,
    renk      TEXT DEFAULT '#4F46E5',
    olusturma DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS aktivite (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    eylem        TEXT,
    urun_adi     TEXT,
    zaman        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rakip_siteler (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT NOT NULL UNIQUE,
    urun_sayisi INTEGER DEFAULT 0,
    son_cekme   DATETIME,
    notlar      TEXT,
    olusturma   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rakip_urunler (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id      INTEGER NOT NULL REFERENCES rakip_siteler(id) ON DELETE CASCADE,
    shopify_id   TEXT,
    title        TEXT,
    handle       TEXT,
    vendor       TEXT,
    product_type TEXT,
    tags         TEXT,
    fiyat        TEXT,
    compare_fiyat TEXT,
    gorsel_url   TEXT,
    available    INTEGER DEFAULT 1,
    created_at   TEXT,
    updated_at   TEXT
  );
`);

// Migrasyonlar — eski DB'lere yeni sütunlar
const migrations = [
  "ALTER TABLE urunler ADD COLUMN tedarik_link TEXT",
  "ALTER TABLE urunler ADD COLUMN para_birimi TEXT",
  "ALTER TABLE urunler ADD COLUMN satis_fiyat TEXT",
  "ALTER TABLE urunler ADD COLUMN ai_analiz TEXT",
  "ALTER TABLE urunler ADD COLUMN ai_tarih DATETIME",
];
migrations.forEach(m => { try { db.exec(m); } catch(e) {} });

// Varsayılan kullanıcılar
if (db.prepare("SELECT COUNT(*) as c FROM kullanicilar").get().c === 0) {
  const ins = db.prepare("INSERT INTO kullanicilar (isim,renk) VALUES (?,?)");
  [["Egemen","#4f7cff"],["Tuna","#22c55e"],["Arda","#f59e0b"],["Melisa","#a78bfa"],["Test Kullanıcısı","#64748b"]]
    .forEach(([isim,renk]) => ins.run(isim,renk));
}

module.exports = { db, UPLOADS_DIR };
