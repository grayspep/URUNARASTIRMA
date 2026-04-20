// XCOMMERCE - Shared Navigation & Auth
const APP_PASS = "Merhaba.12";
const PAGES = [
  { path: "/liste",          icon: "📋", label: "Ürün Listesi" },
  { path: "/rakip-analizi",  icon: "🕵️", label: "Rakip Mağaza" },
  { path: "/istatistikler",  icon: "📊", label: "İstatistikler" },
  { path: "/aktivite",       icon: "⏱",  label: "Aktivite" },
];

function getUser() {
  try { return JSON.parse(sessionStorage.getItem("xc_user")); } catch { return null; }
}
function setUser(u) { sessionStorage.setItem("xc_user", JSON.stringify(u)); }
function clearUser() { sessionStorage.removeItem("xc_user"); }

function initials(name) {
  return (name||"?").split(" ").map(w => w[0]||"").join("").slice(0, 2).toUpperCase();
}

function requireAuth() {
  const u = getUser();
  if (!u) { window.location.href = "/giris"; return null; }
  return u;
}

function logout() {
  clearUser();
  window.location.href = "/giris";
}

function closeSidebar() {
  document.querySelector(".sb")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

function renderSidebar() {
  const user = getUser();
  const cur = window.location.pathname;

  const navItems = PAGES.map(p => `
    <a href="${p.path}" class="ni${cur === p.path ? " on" : ""}" onclick="closeSidebar()">
      <span class="ni-ic">${p.icon}</span>
      <span>${p.label}</span>
    </a>
  `).join("");

  const html = `
    <aside class="sb" id="sidebar">
      <div class="logo">
        <div class="logo-top">Ürün Araştırma</div>
        <div class="logo-main"><span>X</span>COMMERCE</div>
      </div>
      <div class="nsep">Menü</div>
      ${navItems}
      <div class="sbfoot">
        <div class="sb-user">
          <div class="sb-udot" style="background:${user?.renk||"#4f7cff"}">${initials(user?.isim)}</div>
          <div class="sb-uname">${user?.isim||"Kullanıcı"}</div>
          <button class="sb-logout" onclick="logout()" title="Çıkış">↩</button>
        </div>
      </div>
    </aside>
    <div class="sb-overlay" id="overlay" onclick="closeSidebar()"></div>
  `;

  const root = document.getElementById("nav-root");
  if (root) root.innerHTML = html;

  // Hamburger
  const ham = document.getElementById("ham");
  if (ham) {
    ham.onclick = () => {
      document.getElementById("sidebar")?.classList.toggle("open");
      document.getElementById("overlay")?.classList.toggle("open");
    };
  }
}

// Toast utility (shared)
let _toastTimer = null;
function showToast(msg, type = "success") {
  let el = document.getElementById("global-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "global-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  const dotColor = type === "error" ? "var(--red)" : type === "warn" ? "var(--amb)" : "var(--grn)";
  el.innerHTML = `<div class="tdot" style="background:${dotColor}"></div>${msg}`;
  el.style.display = "flex";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = "none"; }, 2800);
}

// API helper
const api = {
  get:  url => fetch(url).then(r => r.json()),
  post: (url, d) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
  put:  (url, d) => fetch(url, { method: "PUT",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
  del:  url => fetch(url, { method: "DELETE" }).then(r => r.json()),
};

function ago(dt) {
  if (!dt) return "—";
  const s = Math.floor((Date.now() - new Date(dt.includes("T") ? dt : dt + "Z")) / 1000);
  if (isNaN(s) || s < 0) return "—";
  if (s < 120) return "az önce";
  if (s < 3600) return Math.floor(s / 60) + " dk önce";
  if (s < 86400) return Math.floor(s / 3600) + " sa önce";
  return Math.floor(s / 86400) + " gün önce";
}

function fmtDate(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  } catch { return dt; }
}

function initials2(name) { return initials(name); }
