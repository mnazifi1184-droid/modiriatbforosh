// منطق صفحه‌ی نمایش — خواندن مستقیم از گوگل‌شیت (endpoint gviz)
(function () {
  // ---------- نگهبانی: بدون ورود، دسترسی نیست ----------
  const SESSION_KEY = "mbf_session";
  const USER_KEY = "mbf_user";
  const sessionKey = localStorage.getItem(SESSION_KEY);
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch {}
  if (!sessionKey || !currentUser) { location.href = "login.html"; return; }
  if (!currentUser.isAdmin && !currentUser.permView) {
    // اجازه‌ی مشاهده ندارد — به صفحه‌ی مجاز خودش بفرست
    location.href = currentUser.permUpload ? "index.html" : "login.html";
    return;
  }

  // ناوبری بر اساس دسترسی
  const navUpload = document.getElementById("nav-upload");
  if (navUpload && (currentUser.isAdmin || currentUser.permUpload)) navUpload.hidden = false;
  const navAdmin = document.getElementById("nav-admin");
  if (navAdmin && currentUser.isAdmin) navAdmin.hidden = false;
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = "login.html";
  });

  const content = document.getElementById("content");
  const emptyState = document.getElementById("empty-state");
  const fileName = document.getElementById("file-name");
  const fileMeta = document.getElementById("file-meta");
  const rowBadge = document.getElementById("row-badge");
  const search = document.getElementById("search");
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("table-body");
  const sheetTabs = document.getElementById("sheet-tabs");

  // شناسه‌ی گوگل‌شیت — از آدرس شیت کپی می‌شود:
  // docs.google.com/spreadsheets/d/«این بخش»/edit
  const SHEET_ID = "SHEET_ID_PLACEHOLDER";

  // شیت‌های شناخته‌شده
  const KNOWN_SHEETS = ["Products", "Barcod", "Pak", "Omr", "Endmonth"];

  let sheets = {};
  let sheetNames = [];
  let active = null;
  let allRows = [];
  let rows = [];
  let loadedAny = false;

  function toFa(n) {
    return Number(n).toLocaleString("fa-IR");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- خواندن یک شیت از gviz ---------- */
  async function fetchSheet(name) {
    const url =
      "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
      "/gviz/tq?tqx=out:json&headers=1&sheet=" + encodeURIComponent(name);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const text = await res.text();
    // پاسخ gviz داخل google.visualization.Query.setResponse(...) است
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("bad envelope");
    const json = JSON.parse(text.slice(start, end + 1));
    if (json.status === "error") throw new Error("sheet error");
    const table = json.table;
    if (!table) throw new Error("no table");

    // عناوین ستون‌ها
    const headers = (table.cols || []).map((c, i) =>
      String((c && c.label) || "ستون " + (i + 1))
    );

    // ردیف‌ها — همه‌ی مقادیر به رشته تبدیل می‌شوند تا صفر ابتدایی حفظ شود
    const out = (table.rows || []).map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = r.c && r.c[i];
        let v = "";
        if (cell) v = cell.f !== undefined && cell.f !== null ? String(cell.f) : (cell.v === null || cell.v === undefined ? "" : String(cell.v));
        obj[h] = v;
      });
      return obj;
    }).filter(obj => Object.values(obj).some(v => String(v).trim() !== ""));

    return { meta: { name: name, sheet: name }, columns: headers, rows: out };
  }

  /* ---------- رندر ---------- */
  function render() {
    thead.innerHTML = "";
    tbody.innerHTML = "";
    if (!rows.length) {
      thead.innerHTML = "<tr><th>—</th></tr>";
      tbody.innerHTML = '<tr><td style="color:var(--muted)">موردی مطابق جستجو پیدا نشد.</td></tr>';
      return;
    }
    const cols = Object.keys(rows[0]);
    thead.innerHTML = "<tr>" + cols.map(c => "<th>" + escapeHtml(c) + "</th>").join("") + "</tr>";
    tbody.innerHTML = rows.map(r =>
      "<tr>" + cols.map(c => {
        const v = r[c] === undefined || r[c] === null ? "" : String(r[c]);
        const isNum = v !== "" && !isNaN(v);
        return "<td" + (isNum ? ' class="num"' : "") + ">" + escapeHtml(v) + "</td>";
      }).join("") + "</tr>"
    ).join("");
  }

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    rows = q
      ? allRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))
      : allRows;
    rowBadge.textContent = q
      ? toFa(rows.length) + " از " + toFa(allRows.length) + " سطر"
      : toFa(allRows.length) + " سطر";
    render();
  }

  function activateSheet(name) {
    active = name;
    const data = sheets[name];
    if (!data) return;
    allRows = data.rows || [];
    content.hidden = false;
    fileName.textContent = (data.meta && data.meta.name) || "گوگل‌شیت";
    fileMeta.textContent = "شیت «" + name + "» — مستقیم از گوگل‌شیت خوانده شد";
    search.value = "";
    applyFilter();
    [...sheetTabs.children].forEach(btn => {
      btn.classList.toggle("active", btn.dataset.sheet === name);
    });
  }

  function renderTabs() {
    sheetTabs.hidden = false;
    sheetTabs.innerHTML = "";
    sheetNames.forEach(name => {
      const b = document.createElement("button");
      b.className = "sheet-tab";
      b.dataset.sheet = name;
      const count = sheets[name] && sheets[name].rows ? sheets[name].rows.length : 0;
      b.innerHTML = escapeHtml(name) + ' <span class="tab-count">' + toFa(count) + "</span>";
      b.addEventListener("click", () => activateSheet(name));
      sheetTabs.appendChild(b);
    });
  }

  function loadFromObject(obj) {
    sheets = {};
    sheetNames = [];
    Object.keys(obj).forEach(name => {
      const d = obj[name];
      if (d && Array.isArray(d.rows) && d.rows.length) {
        sheets[name] = d;
        sheetNames.push(name);
      }
    });
    if (!sheetNames.length) return false;
    sheetNames.sort((a, b) => {
      const ia = KNOWN_SHEETS.indexOf(a), ib = KNOWN_SHEETS.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
    renderTabs();
    activateSheet(sheetNames[0]);
    search.addEventListener("input", applyFilter);
    return true;
  }

  /* ---------- شروع: خواندن شیت‌های شناخته‌شده از گوگل‌شیت ---------- */
  (async () => {
    if (SHEET_ID === "SHEET_ID_PLACEHOLDER") {
      emptyState.hidden = false;
      emptyState.querySelector("strong").textContent = "شناسه‌ی گوگل‌شیت تنظیم نشده";
      emptyState.querySelector("p").textContent = "مدیر باید شناسه‌ی شیت را در view.js وارد کند.";
      return;
    }

    const results = await Promise.all(
      KNOWN_SHEETS.map(name =>
        fetchSheet(name)
          .then(data => ({ name: name, data: data, ok: true }))
          .catch(() => ({ name: name, data: null, ok: false }))
      )
    );

    const obj = {};
    results.forEach(r => {
      if (r.ok && r.data.rows.length) obj[r.name] = r.data;
    });

    if (loadFromObject(obj)) {
      loadedAny = true;
      return;
    }

    // هیچ شیتی خوانده نشد — احتمالاً شیت عمومی نیست یا شبکه به گوگل وصل نیست
    const local = localStorage.getItem("mbf_sheets");
    if (local) {
      try {
        if (loadFromObject(JSON.parse(local))) return;
      } catch {}
    }
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "اتصال به گوگل‌شیت برقرار نشد";
    emptyState.querySelector("p").textContent = "برای دیدن داده‌ها به VPN نیاز است، یا شیت هنوز از طریق «Share → Anyone with the link» عمومی نشده است.";
  })();
})();
