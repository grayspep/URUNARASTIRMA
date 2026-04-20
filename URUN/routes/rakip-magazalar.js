const express = require("express");
const router = express.Router();
const { db } = require("../db");

// Tüm kayıtlı siteleri getir
router.get("/", (req, res) => {
  const siteler = db.prepare("SELECT * FROM rakip_siteler ORDER BY son_cekme DESC").all();
  siteler.forEach(s => {
    s.urunler = db.prepare("SELECT * FROM rakip_urunler WHERE site_id=? ORDER BY updated_at DESC").all(s.id);
  });
  res.json(siteler);
});

// URL'yi normalize et
function normalizeUrl(url) {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase().trim();
}

// Shopify products.json çek ve kaydet
router.post("/ara", async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL gerekli" });

  url = normalizeUrl(url);
  if (!url) return res.status(400).json({ error: "Geçersiz URL" });

  const fetchUrl = `https://${url}/products.json?limit=250`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({
        error: `Site yanıt vermedi (HTTP ${response.status}). Site Shopify kullanmıyor veya products.json kapalı olabilir.`
      });
    }

    const data = await response.json();
    const products = data.products || [];

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: "Geçerli Shopify products.json formatı bulunamadı." });
    }

    // DB'ye kaydet veya güncelle
    let site = db.prepare("SELECT * FROM rakip_siteler WHERE url=?").get(url);
    if (site) {
      db.prepare("UPDATE rakip_siteler SET son_cekme=CURRENT_TIMESTAMP, urun_sayisi=? WHERE id=?")
        .run(products.length, site.id);
    } else {
      const r = db.prepare("INSERT INTO rakip_siteler (url, urun_sayisi, son_cekme) VALUES (?,?,CURRENT_TIMESTAMP)")
        .run(url, products.length);
      site = { id: r.lastInsertRowid, url };
    }

    // Ürünleri güncelle
    db.prepare("DELETE FROM rakip_urunler WHERE site_id=?").run(site.id);
    const ins = db.prepare(`
      INSERT INTO rakip_urunler
        (site_id, shopify_id, title, handle, vendor, product_type, tags, fiyat, compare_fiyat, gorsel_url, available, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const insertMany = db.transaction((prods) => {
      prods.forEach(p => {
        const variant = p.variants?.[0] || {};
        const image = p.images?.[0]?.src || "";
        const tags = Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || "");
        ins.run(
          site.id, String(p.id), p.title, p.handle, p.vendor||"", p.product_type||"",
          tags, variant.price||"", variant.compare_at_price||"",
          image, variant.available ? 1 : 0, p.created_at||"", p.updated_at||""
        );
      });
    });
    insertMany(products);

    // Güncel veriyi döndür
    const savedSite = db.prepare("SELECT * FROM rakip_siteler WHERE id=?").get(site.id);
    savedSite.urunler = db.prepare("SELECT * FROM rakip_urunler WHERE site_id=? ORDER BY updated_at DESC").all(site.id);

    res.json(savedSite);
  } catch(e) {
    if (e.name === "AbortError") {
      return res.status(408).json({ error: "Zaman aşımı — site çok yavaş yanıt veriyor (15sn)." });
    }
    res.status(500).json({ error: `Veri çekilemedi: ${e.message}` });
  }
});

// Siteyi yenile
router.post("/:id/yenile", async (req, res) => {
  const site = db.prepare("SELECT * FROM rakip_siteler WHERE id=?").get(req.params.id);
  if (!site) return res.status(404).json({ error: "Site bulunamadı" });
  req.body = { url: site.url };
  // yeniden ara endpoint'ini çağır
  return router.handle ? res.redirect(307, "/api/rakip-magazalar/ara") : res.json({ error: "Yeniden ara" });
});

// Site sil
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM rakip_siteler WHERE id=?").run(req.params.id);
  res.json({ message: "ok" });
});

// Tek sitenin ürünlerini getir
router.get("/:id/urunler", (req, res) => {
  const urunler = db.prepare("SELECT * FROM rakip_urunler WHERE site_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json(urunler);
});

module.exports = router;
