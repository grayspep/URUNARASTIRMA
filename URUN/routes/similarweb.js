const express = require("express");
const router = express.Router();
const { db } = require("../db");

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const SW_HOST       = "similarweb-insights.p.rapidapi.com";
const CACHE_DAYS    = 30; // 30 gün cache — rate limit koruma

const ENDPOINTS = ["traffic", "rank", "similar-sites", "country-metadata"];

async function swFetch(endpoint, domain) {
  const qs = endpoint === "traffic" ? "?domain=" + encodeURIComponent(domain) + "&detailed=true"
                                    : "?domain=" + encodeURIComponent(domain);
  const url = `https://${SW_HOST}/${endpoint}${qs}`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key":  RAPIDAPI_KEY,
      "X-RapidAPI-Host": SW_HOST,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${endpoint}: HTTP ${res.status} — ${txt.slice(0,120)}`);
  }
  return res.json();
}

function isCacheValid(guncelleme) {
  if (!guncelleme) return false;
  const age = Date.now() - new Date(guncelleme + (guncelleme.includes("Z") ? "" : "Z")).getTime();
  return age < CACHE_DAYS * 24 * 60 * 60 * 1000;
}

function safeJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/* GET /api/similarweb/:domain — önbellekten veya API'den */
router.get("/:domain", async (req, res) => {
  if (!RAPIDAPI_KEY) {
    return res.status(400).json({ error: "RAPIDAPI_KEY ayarlanmamış. Railway → Variables bölümüne RAPIDAPI_KEY ekle." });
  }

  const domain = req.params.domain.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();

  // Cache kontrolü
  const cached = db.prepare("SELECT * FROM similarweb_cache WHERE domain=?").get(domain);
  if (cached && isCacheValid(cached.guncelleme)) {
    return res.json({
      cached: true,
      domain,
      traffic: safeJSON(cached.traffic_data),
      rank:    safeJSON(cached.rank_data),
      similar: safeJSON(cached.similar_data),
      country: safeJSON(cached.country_data),
      guncelleme: cached.guncelleme,
    });
  }

  // API'den çek (4 paralel istek)
  const errors = [];
  const [traffic, rank, similar, country] = await Promise.all(
    ENDPOINTS.map(ep => swFetch(ep, domain).catch(e => { errors.push(e.message); return null; }))
  );

  if (!traffic && !rank && !similar && !country) {
    return res.status(502).json({ error: "Tüm endpointler başarısız: " + errors.join("; ") });
  }

  // Cache'e kaydet
  const tStr = JSON.stringify(traffic);
  const rStr = JSON.stringify(rank);
  const sStr = JSON.stringify(similar);
  const cStr = JSON.stringify(country);

  if (cached) {
    db.prepare(`UPDATE similarweb_cache
      SET traffic_data=?, rank_data=?, similar_data=?, country_data=?, guncelleme=CURRENT_TIMESTAMP
      WHERE domain=?`).run(tStr, rStr, sStr, cStr, domain);
  } else {
    db.prepare(`INSERT INTO similarweb_cache (domain, traffic_data, rank_data, similar_data, country_data)
      VALUES (?,?,?,?,?)`).run(domain, tStr, rStr, sStr, cStr);
  }

  res.json({
    cached: false,
    domain,
    traffic,
    rank,
    similar,
    country,
    guncelleme: new Date().toISOString(),
    errors: errors.length ? errors : undefined,
  });
});

/* DELETE /api/similarweb/:domain — cache'i temizle (zorla yenile) */
router.delete("/:domain", (req, res) => {
  const domain = req.params.domain.toLowerCase();
  db.prepare("DELETE FROM similarweb_cache WHERE domain=?").run(domain);
  res.json({ message: "Cache silindi, bir sonraki istekte API'den çekilecek." });
});

module.exports = router;
