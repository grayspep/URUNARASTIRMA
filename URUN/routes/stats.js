const express = require("express");
const router = express.Router();
const { db } = require("../db");

router.get("/", (req, res) => {
  const urunler = db.prepare("SELECT * FROM urunler").all();
  const avgScore = urunler.length ? Math.round(urunler.reduce((s, u) => {
    let sc = 0;
    if (u.fomo === "Evet") sc += 25;
    if (u.breakeven === "Evet") sc += 25;
    if (u.kreatif === "Video ve Görsel Kreatif Var") sc += 20;
    if (u.rakip === "1 Aydan Kısa") sc += 30;
    else if (u.rakip === "3 Aydan Kısa") sc += 15;
    return s + sc;
  }, 0) / urunler.length) : 0;

  res.json({
    total:          db.prepare("SELECT COUNT(*) as c FROM urunler").get().c,
    onaylanan:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE durum='Onaylandı'").get().c,
    fomo_evet:      db.prepare("SELECT COUNT(*) as c FROM urunler WHERE fomo='Evet'").get().c,
    breakeven_evet: db.prepare("SELECT COUNT(*) as c FROM urunler WHERE breakeven='Evet'").get().c,
    avg_score:      avgScore,
    nis_dagilim:    db.prepare("SELECT nis, COUNT(*) as c FROM urunler WHERE nis!='' GROUP BY nis ORDER BY c DESC").all(),
    durum_dagilim:  db.prepare("SELECT durum, COUNT(*) as c FROM urunler WHERE durum!='' GROUP BY durum ORDER BY c DESC").all(),
    tip_dagilim:    db.prepare("SELECT tip, COUNT(*) as c FROM urunler WHERE tip!='' GROUP BY tip ORDER BY c DESC").all(),
    fiyat_dagilim:  db.prepare("SELECT fiyat, COUNT(*) as c FROM urunler WHERE fiyat!='' GROUP BY fiyat ORDER BY c DESC").all(),
    son_aktivite:   db.prepare(`
      SELECT a.eylem, a.urun_adi, a.zaman, k.isim, k.renk
      FROM aktivite a LEFT JOIN kullanicilar k ON a.kullanici_id=k.id
      ORDER BY a.zaman DESC LIMIT 20
    `).all(),
    rakip_siteler:  db.prepare("SELECT COUNT(*) as c FROM rakip_siteler").get().c,
    rakip_urunler:  db.prepare("SELECT COUNT(*) as c FROM rakip_urunler").get().c,
  });
});

module.exports = router;
