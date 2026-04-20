const express = require("express");
const router = express.Router();
const { db } = require("../db");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

function getUrunFull(id) {
  const u = db.prepare("SELECT * FROM urunler WHERE id=?").get(id);
  if (!u) return null;
  u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=? ORDER BY id").all(id);
  u.gorseller = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(id);
  return u;
}

router.get("/", (req, res) => {
  const { nis, tip, durum, arama } = req.query;
  let sql = "SELECT * FROM urunler WHERE 1=1"; const p = [];
  if (nis)   { sql += " AND nis=?";   p.push(nis); }
  if (tip)   { sql += " AND tip=?";   p.push(tip); }
  if (durum) { sql += " AND durum=?"; p.push(durum); }
  if (arama) { sql += " AND (urun LIKE ? OR notlar LIKE ?)"; p.push(`%${arama}%`, `%${arama}%`); }
  sql += " ORDER BY olusturma DESC";
  const rows = db.prepare(sql).all(...p);
  rows.forEach(u => {
    u.rakip_magazalar = db.prepare("SELECT * FROM rakip_magazalar WHERE urun_id=?").all(u.id);
    u.gorseller = db.prepare("SELECT * FROM gorseller WHERE urun_id=? ORDER BY yuklenme DESC").all(u.id);
  });
  res.json(rows);
});

router.post("/", (req, res) => {
  const { urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar,rakip_magazalar,kullanici_id } = req.body;
  const r = db.prepare(`INSERT INTO urunler (urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(urun,link,tedarik_link,gorsel,nis,tip,durum||"Araştırılıyor",kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi||"USD",satis_fiyat,alis_fiyat,notlar);
  const uid = r.lastInsertRowid;
  if (Array.isArray(rakip_magazalar)) {
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(x => ins.run(uid, x.url, JSON.stringify(x.ulkeler||[]), x.notlar||""));
  }
  if (kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id, "ekledi", urun);
  res.json({ id: uid });
});

router.put("/:id", (req, res) => {
  const { urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi,satis_fiyat,alis_fiyat,notlar,rakip_magazalar,kullanici_id } = req.body;
  db.prepare(`UPDATE urunler SET urun=?,link=?,tedarik_link=?,gorsel=?,nis=?,tip=?,durum=?,kaynak=?,fomo=?,rakip=?,kreatif=?,breakeven=?,fiyat=?,para_birimi=?,satis_fiyat=?,alis_fiyat=?,notlar=?,guncelleme=CURRENT_TIMESTAMP WHERE id=?`)
    .run(urun,link,tedarik_link,gorsel,nis,tip,durum,kaynak,fomo,rakip,kreatif,breakeven,fiyat,para_birimi||"USD",satis_fiyat,alis_fiyat,notlar,req.params.id);
  if (Array.isArray(rakip_magazalar)) {
    db.prepare("DELETE FROM rakip_magazalar WHERE urun_id=?").run(req.params.id);
    const ins = db.prepare("INSERT INTO rakip_magazalar (urun_id,url,ulkeler,notlar) VALUES (?,?,?,?)");
    rakip_magazalar.forEach(x => ins.run(req.params.id, x.url, JSON.stringify(x.ulkeler||[]), x.notlar||""));
  }
  if (kullanici_id) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id, "güncelledi", urun);
  res.json({ message: "ok" });
});

router.delete("/:id", (req, res) => {
  const u = db.prepare("SELECT urun FROM urunler WHERE id=?").get(req.params.id);
  db.prepare("DELETE FROM urunler WHERE id=?").run(req.params.id);
  const { kullanici_id } = req.body||{};
  if (kullanici_id && u) db.prepare("INSERT INTO aktivite (kullanici_id,eylem,urun_adi) VALUES (?,?,?)").run(kullanici_id, "sildi", u.urun);
  res.json({ message: "ok" });
});

// AI Analiz
router.post("/:id/analiz", async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY ayarlanmamış. Railway → Variables bölümüne ekle." });
  const u = getUrunFull(req.params.id);
  if (!u) return res.status(404).json({ error: "Ürün bulunamadı" });

  const rms = (u.rakip_magazalar||[]).map(r => {
    let ul=[]; try { const p=JSON.parse(r.ulkeler||"[]"); ul=Array.isArray(p)?p:[]; } catch(e) {}
    return `- ${r.url||"?"} (Pazarlar: ${ul.join(", ")||"belirtilmemiş"})${r.notlar?" — "+r.notlar:""}`;
  }).join("\n");

  const prompt = `Sen bir dropshipping ürün analistisin. Türkçe, kısa ve öz yaz.

ÜRÜN: ${u.urun||"—"} | Niş: ${u.nis||"—"} | Tip: ${u.tip||"—"}
FOMO: ${u.fomo||"—"} | Rakip Süre: ${u.rakip||"—"} | Kreatif: ${u.kreatif||"—"} | Breakeven: ${u.breakeven||"—"}
Satış: ${u.satis_fiyat?u.satis_fiyat+" "+(u.para_birimi||"USD"):u.fiyat||"—"} | Alış: ${u.alis_fiyat?u.alis_fiyat+" "+(u.para_birimi||"USD"):"—"}
Durum: ${u.durum||"—"} | Kaynak: ${u.kaynak||"—"} | Görseller: ${(u.gorseller||[]).length}
Notlar: ${u.notlar||"—"}
Rakipler:\n${rms||"Belirtilmemiş"}

Başlıklarla analiz et:
🎯 KARAR: [SAT / SATMA / TEST ET] — tek cümle
💪 GÜÇLÜ YÖNLER (2-3 madde)
⚠️ ZAYIF YÖNLER (2-3 madde)
🌍 EN İYİ PAZAR (1-2 cümle)
📣 REKLAM STRATEJİSİ (2-3 öneri)
🔴 RİSK: [DÜŞÜK / ORTA / YÜKSEK] — kısa gerekçe`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message||"API hatası" });
    const analiz = data.content?.[0]?.text||"";
    db.prepare("UPDATE urunler SET ai_analiz=?,ai_tarih=CURRENT_TIMESTAMP WHERE id=?").run(analiz, req.params.id);
    res.json({ analiz });
  } catch(e) {
    res.status(500).json({ error: "AI bağlantı hatası: "+e.message });
  }
});

module.exports = router;
