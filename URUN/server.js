const express = require("express");
const path = require("path");
const { db } = require("./db");
const { uploadRouter, deleteRouter } = require("./routes/gorseller");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── API ROUTES ───────────────────────────────────────────────
app.use("/api/urunler",          require("./routes/urunler"));
app.use("/api/urunler/:urun_id/gorseller", uploadRouter);
app.use("/api/gorseller",        deleteRouter);
app.use("/api/rakip-magazalar",  require("./routes/rakip-magazalar"));
app.use("/api/stats",            require("./routes/stats"));
app.use("/api/kullanicilar",     require("./routes/kullanicilar"));

// ─── CSV EXPORT ───────────────────────────────────────────────
app.get("/api/export/csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM urunler ORDER BY olusturma DESC").all();
  const hdr = ["ID","Ürün","Reklam Linki","Tedarik Linki","Niş","Tip","Durum","Kaynak","FOMO","Rakip","Kreatif","1:6","Fiyat Aralığı","Para Birimi","Satış Fiyatı","Alış Fiyatı","Notlar","Oluşturma"];
  const csv = [hdr, ...rows.map(u => [u.id,u.urun,u.link,u.tedarik_link,u.nis,u.tip,u.durum,u.kaynak,u.fomo,u.rakip,u.kreatif,u.breakeven,u.fiyat,u.para_birimi,u.satis_fiyat,u.alis_fiyat,u.notlar,u.olusturma])]
    .map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv;charset=utf-8");
  res.setHeader("Content-Disposition", `attachment;filename="xcommerce-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send("\ufeff" + csv);
});

// ─── PAGE ROUTES ──────────────────────────────────────────────
const pages = ["giris", "liste", "rakip-analizi", "istatistikler", "aktivite"];
pages.forEach(p => {
  app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${p}.html`)));
});
app.get("/", (req, res) => res.redirect("/giris"));
app.get("*", (req, res) => res.redirect("/giris"));

app.listen(PORT, () => console.log(`✓ XCOMMERCE http://localhost:${PORT}`));
