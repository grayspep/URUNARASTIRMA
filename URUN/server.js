const express = require("express");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const DATA_DIR    = process.env.DATA_DIR    || path.join(__dirname, "data");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── VERİTABANI ──────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, "urunler.db"));
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
`);

// Migrasyon — eski veritabanlarına yeni sütunlar ekle
["tedarik_link TEXT","para_birimi TEXT","satis_fiyat TEXT","ai_analiz TEXT","ai_tarih DATETIME"].forEach(col => {
  try { db.exec(`ALTER TABLE urunler ADD COLUMN ${col};`); } catch(e) {}
});

// Varsayılan kullanıcılar
if (db.prepare("SELECT COUNT(*) as c FROM kullanicilar").get().c === 0) {
  const ins = db.prepare("INSERT INTO kullanicilar (isim,renk) VALUES (?,?)");
  ins.run("Egemen","#4f7cff"); ins.run("Tuna","#22c55e");
  ins.run("Arda","#f59e0b");   ins.run("Melisa","#a78bfa");
  ins.run("Test Kullanıcısı","#64748b");
}

// ─── MULTER ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20*1024*1024 },
  fileFilter: (req,file,cb) => { const ok=/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname); cb(ok?null:new Error("Sadece görsel"),ok); }
});

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

function getUrunFull(id) {
  const u = db.prepare("SELECT * FROM urunler WHERE id=?").get(id);
  if (!u) return null;
  u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=? ORDER BY id").all(id);
  u.gorseller       = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(id);
  return u;
}

// ─── ÜRÜNLER ─────────────────────────────────────────────────
app.get("/api/urunler", (req,res) => {
  const { nis,tip,durum,arama } = req.query;
  let sql = "SELECT * FROM urunler WHERE 1=1"; const p=[];
  if(nis)   { sql+=" AND nis=?";   p.push(nis); }
  if(tip)   { sql+=" AND tip=?";   p.push(tip); }
  if(durum) { sql+=" AND durum=?"; p.push(durum); }
  if(arama) { sql+=" AND (urun LIKE ? OR notlar LIKE ?)"; p.push(`%${arama}%`,`%${arama}%`); }
  sql+=" ORDER BY olusturma DESC";
  const rows = db.prepare(sql).all(...p);
  rows.forEach(u => {
    u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=?").all(u.id);
    u.gorseller       = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(u.id);
  });
  res.json(rows);
});

app.post("/api/urunler", (req,res) => {
  const {urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar,rakip_magazalar,kullanici_id} = req.body;
  const r = db.prepare(`INSERT INTO urunler (urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(urun,link,tedarik_link,gorsel,nis,tip,durum||"Araştırılıyor",kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi||"USD",satis_fiyat,alis_fiyat,notlar);
  const uid = r.lastInsertRowid;
  if(Array.isArray(rakip_magazalar)){
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(x => ins.run(uid,x.url,JSON.stringify(x.ulkeler||[]),x.notlar||""));
  }
  if(kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"ekledi",urun);
  res.json({id:uid});
});

app.put("/api/urunler/:id", (req,res) => {
  const {urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar,rakip_magazalar,kullanici_id} = req.body;
  db.prepare(`UPDATE urunler SET urun=?,link=?,tedarik_link=?,gorsel=?,nis=?,tip=?,durum=?,kaynak=?,fomo=?,rakip=?,kreatif=?,breakeven=?,fiyat=?,para_birimi=?,satis_fiyat=?,alis_fiyat=?,notlar=?,guncelleme=CURRENT_TIMESTAMP WHERE id=?`)
    .run(urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi||"USD",satis_fiyat,alis_fiyat,notlar,req.params.id);
  if(Array.isArray(rakip_magazalar)){
    db.prepare("DELETE FROM rakip_magazalar WHERE urun_id=?").run(req.params.id);
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(x => ins.run(req.params.id,x.url,JSON.stringify(x.ulkeler||[]),x.notlar||""));
  }
  if(kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"güncelledi",urun);
  res.json({message:"ok"});
});

app.delete("/api/urunler/:id", (req,res) => {
  const u = db.prepare("SELECT urun FROM urunler WHERE id=?").get(req.params.id);
  db.prepare("SELECT dosya_adi FROM gorseller WHERE urun_id=?").all(req.params.id)
    .forEach(g => { try{ fs.unlinkSync(path.join(UPLOADS_DIR,g.dosya_adi)); }catch(e){} });
  db.prepare("DELETE FROM urunler WHERE id=?").run(req.params.id);
  const {kullanici_id} = req.body||{};
  if(kullanici_id&&u) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id,"sildi",u.urun);
  res.json({message:"ok"});
});

// ─── AI ANALİZ ───────────────────────────────────────────────
app.post("/api/urunler/:id/analiz", async (req,res) => {
  if(!ANTHROPIC_API_KEY) return res.status(400).json({error:"ANTHROPIC_API_KEY ayarlanmamış. Railway → Variables bölümüne ekle."});
  const u = getUrunFull(req.params.id);
  if(!u) return res.status(404).json({error:"Ürün bulunamadı"});

  const rms = (u.rakip_magazalar||[]).map(r => {
    let ul=[]; try{ const p=JSON.parse(r.ulkeler||"[]"); ul=Array.isArray(p)?p:[]; }catch(e){}
    return `- ${r.url||"?"} (Pazarlar: ${ul.join(", ")||"belirtilmemiş"})${r.notlar?" — "+r.notlar:""}`;
  }).join("\n");

  const fiyatBilgi = u.satis_fiyat ? `${u.satis_fiyat} ${u.para_birimi||"USD"}` : (u.fiyat||"—");
  const alisBilgi  = u.alis_fiyat  ? `${u.alis_fiyat} ${u.para_birimi||"USD"}` : "—";

  const prompt = `Sen bir dropshipping ürün analistisin. Aşağıdaki ürünü analiz et ve net, pratik değerlendirme yaz. Türkçe yaz. Madde madde, kısa ve öz ol.

ÜRÜN BİLGİLERİ:
- Ürün: ${u.urun||"—"}
- Niş: ${u.nis||"—"} | Tip: ${u.tip||"—"}
- FOMO: ${u.fomo||"—"} | Rakip Süre: ${u.rakip||"—"}
- Kreatif: ${u.kreatif||"—"} | 1:6 Breakeven: ${u.breakeven||"—"}
- Satış Fiyatı: ${fiyatBilgi} | Alış: ${alisBilgi}
- Durum: ${u.durum||"—"} | Kaynak: ${u.kaynak||"—"}
- Yüklenen Görsel Sayısı: ${(u.gorseller||[]).length}
- Notlar: ${u.notlar||"—"}
- Rakip Mağazalar:\n${rms||"Belirtilmemiş"}

Şu başlıklarla analiz et:

🎯 KARAR: [SAT / SATMA / TEST ET] — tek cümle gerekçe

💪 GÜÇLÜ YÖNLER
- (2-3 madde)

⚠️ ZAYIF YÖNLER
- (2-3 madde)

🌍 EN İYİ PAZAR
- Hangi ülke/pazar daha uygun ve neden

📣 REKLAM STRATEJİSİ
- (2-3 pratik öneri)

🔴 RİSK SEVİYESİ: [DÜŞÜK / ORTA / YÜKSEK] — kısa gerekçe`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1024,messages:[{role:"user",content:prompt}]})
    });
    const data = await response.json();
    if(!response.ok) return res.status(500).json({error:data.error?.message||"API hatası"});
    const analiz = data.content?.[0]?.text||"";
    db.prepare("UPDATE urunler SET ai_analiz=?,ai_tarih=CURRENT_TIMESTAMP WHERE id=?").run(analiz,req.params.id);
    res.json({analiz});
  } catch(e) {
    res.status(500).json({error:"Bağlantı hatası: "+e.message});
  }
});

// ─── GÖRSELLER ───────────────────────────────────────────────
app.post("/api/urunler/:id/gorseller", upload.array("gorseller",50), (req,res) => {
  if(!req.files?.length) return res.status(400).json({error:"Dosya yok"});
  const ins = db.prepare("INSERT INTO gorseller (urun_id,dosya_adi,aciklama) VALUES (?,?,?)");
  const eklenen = req.files.map(f => {
    const r = ins.run(req.params.id,f.filename,req.body.aciklama||"");
    return {id:r.lastInsertRowid,dosya_adi:f.filename,url:`/uploads/${f.filename}`};
  });
  res.json({eklenen});
});

app.delete("/api/gorseller/:id", (req,res) => {
  const g = db.prepare("SELECT dosya_adi FROM gorseller WHERE id=?").get(req.params.id);
  if(!g) return res.status(404).json({error:"Yok"});
  try{ fs.unlinkSync(path.join(UPLOADS_DIR,g.dosya_adi)); }catch(e){}
  db.prepare("DELETE FROM gorseller WHERE id=?").run(req.params.id);
  res.json({message:"ok"});
});

// ─── İSTATİSTİKLER ───────────────────────────────────────────
app.get("/api/stats", (req,res) => {
  res.json({
    total:          db.prepare("SELECT COUNT(*) as c FROM urunler").get().c,
    onaylanan:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE durum='Onaylandı'").get().c,
    fomo_evet:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE fomo='Evet'").get().c,
    breakeven_evet: db.prepare("SELECT COUNT(*) as c FROM urunler WHERE breakeven='Evet'").get().c,
    nis_dagilim:    db.prepare("SELECT nis, COUNT(*) as c FROM urunler WHERE nis!='' GROUP BY nis ORDER BY c DESC").all(),
    durum_dagilim:  db.prepare("SELECT durum, COUNT(*) as c FROM urunler GROUP BY durum ORDER BY c DESC").all(),
    son_aktivite:   db.prepare("SELECT a.eylem,a.urun_adi,a.zaman,k.isim,k.renk FROM aktivite a LEFT JOIN kullanicilar k ON a.kullanici_id=k.id ORDER BY a.zaman DESC LIMIT 15").all()
  });
});

app.get("/api/kullanicilar", (req,res) => res.json(db.prepare("SELECT * FROM kullanicilar").all()));
app.post("/api/kullanicilar", (req,res) => {
  const r = db.prepare("INSERT INTO kullanicilar (isim,renk) VALUES (?,?)").run(req.body.isim,req.body.renk||"#4f7cff");
  res.json({id:r.lastInsertRowid});
});

app.get("/api/export/csv", (req,res) => {
  const rows = db.prepare("SELECT * FROM urunler ORDER BY olusturma DESC").all();
  const hdr = ["ID","Ürün","Reklam Linki","Tedarik Linki","Niş","Tip","Durum","Kaynak","FOMO","Rakip","Kreatif","1:6","Fiyat Aralığı","Para Birimi","Satış Fiyatı","Alış Fiyatı","Notlar","Oluşturma"];
  const csv = [hdr,...rows.map(u=>[u.id,u.urun,u.link,u.tedarik_link,u.nis,u.tip,u.durum,u.kaynak,u.fomo,u.rakip,u.kreatif,u.breakeven,u.fiyat,u.para_birimi,u.satis_fiyat,u.alis_fiyat,u.notlar,u.olusturma])]
    .map(r=>r.map(c=>`"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type","text/csv;charset=utf-8");
  res.setHeader("Content-Disposition",`attachment;filename="xcommerce-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send("\ufeff"+csv);
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`✓ XCOMMERCE http://localhost:${PORT}`));
