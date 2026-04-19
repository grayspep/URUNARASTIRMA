# Ürün Araştırma Sistemi v2

Dropshipping ürün araştırma ve takip uygulaması.
Node.js + Express + SQLite — tek sunucu, sıfır harici bağımlılık.

---

## 🚀 Kendi Sunucuna Deploy (Önerilen)

### Gereksinimler
- Node.js 18+
- npm

### Adımlar
```bash
# Dosyaları sunucuna at (FTP / scp / git)
scp -r urun-app/ kullanici@sunucu-ip:/var/www/urun-app

# Sunucuda:
cd /var/www/urun-app
npm install
node server.js
# → http://sunucu-ip:3000 adresinde çalışır
```

### PM2 ile Otomatik Başlatma (Tavsiye)
```bash
npm install -g pm2
pm2 start server.js --name urun-app
pm2 save
pm2 startup   # sunucu yeniden başlayınca otomatik başlar
```

### Nginx Reverse Proxy (domain için)
```nginx
server {
    listen 80;
    server_name urun.siteniz.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Görseller için önbellek
    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
        expires 30d;
    }
}
```

---

## ☁️ Railway (Ücretsiz Cloud)

1. GitHub'a push et:
```bash
git init
git add .
git commit -m "ilk commit"
git remote add origin https://github.com/KULLANICI/urun-arastirma.git
git push -u origin main
```

2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Repo seç → otomatik deploy
4. Settings → Volumes → `/data` dizinine volume ekle (veri kalıcılığı için)
5. Settings → Domains → Generate Domain

### Railway Ortam Değişkenleri
```
DATA_DIR=/data
UPLOADS_DIR=/data/uploads
PORT=3000
```

---

## 🖥️ Yerel Çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

---

## 📁 Dosya Yapısı

```
urun-app/
├── server.js          ← Backend (Express + SQLite + Multer)
├── package.json
├── Procfile           ← Railway/Render için
├── public/
│   ├── index.html     ← Tüm frontend (React CDN)
│   └── uploads/       ← Yüklenen görseller
└── data/              ← SQLite veritabanı (otomatik oluşur)
    └── urunler.db
```

---

## 👥 Ekip Üyesi Ekleme

API'ye POST at:
```bash
curl -X POST http://localhost:3000/api/kullanicilar \
  -H "Content-Type: application/json" \
  -d '{"isim": "Yeni Üye", "renk": "#22c55e"}'
```

---

## 🔒 Güvenlik Notu

Uygulamaya şifre koruması eklemek istersen `server.js` dosyasında şu satırı açıkla:
```js
// server.js başına ekle:
const SIFRE = process.env.APP_SIFRE || "degistir123";
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
    const auth = req.headers.authorization;
    if (auth !== "Bearer " + SIFRE) return res.status(401).json({ error: "Yetkisiz" });
  }
  next();
});
```
