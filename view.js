// منطق صفحه‌ی نمایش — هر شیت یک فایل JSON در data/
(function () {
  const content = document.getElementById("content");
  const emptyState = document.getElementById("empty-state");
  const fileName = document.getElementById("file-name");
  const fileMeta = document.getElementById("file-meta");
  const rowBadge = document.getElementById("row-badge");
  const search = document.getElementById("search");
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("table-body");
  const sheetTabs = document.getElementById("sheet-tabs");

  // شیت‌های شناخته‌شده — هم‌نام شیت‌های گوگل‌شیت
  const KNOWN_SHEETS = ["Products", "Barcod", "Pak", "Omr", "Endmonth"];

  let sheets = {};       // name -> {meta, columns, rows}
  let sheetNames = [];   // ترتیب تب‌ها
  let active = null;
  let allRows = [];
  let rows = [];

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
    fileName.textContent = (data.meta && data.meta.name) || "نامشخص";
    let metaText = "";
    if (data.meta && data.meta.updated) {
      const d = new Date(data.meta.updated);
      metaText += "شیت «" + name + "» — آخرین به‌روزرسانی: " + d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    }
    if (previewOnly) metaText += " (پیش‌نمایش محلی — برای همه منتشر نشده)";
    fileMeta.textContent = metaText;
    search.value = "";
    applyFilter();
    // حالت فعال تب‌ها
    [...sheetTabs.children].forEach(btn => {
      btn.classList.toggle("active", btn.dataset.sheet === name);
    });
  }

  function renderTabs() {
    if (sheetNames.length <= 1) { sheetTabs.hidden = sheetNames.length < 1; }
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

  function loadFromObject(obj, isLocal) {
    sheets = {};
    sheetNames = [];
    Object.keys(obj).forEach(name => {
      const d = obj[name];
      if (d && Array.isArray(d.rows) && d.rows.length) {
        sheets[name] = d;
        sheetNames.push(name);
      }
    });
    previewOnly = !!isLocal;
    if (!sheetNames.length) return false;
    // ترتیب: شیت‌های شناخته‌شده اول، بعد بقیه
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

  let previewOnly = false;

  // اول: فهرست شیت‌های منتشرشده را از مانیفست (یا شیت‌های شناخته‌شده) بخوان
  fetch("data/sheets.json?t=" + Date.now(), { cache: "no-store" })
    .then(res => (res.ok ? res.json() : { sheets: {} }))
    .catch(() => ({ sheets: {} }))
    .then(manifest => {
      const published = manifest && manifest.sheets ? Object.keys(manifest.sheets) : [];
      const candidates = [];
      KNOWN_SHEETS.forEach(n => { if (!candidates.includes(n)) candidates.push(n); });
      published.forEach(n => { if (!candidates.includes(n)) candidates.push(n); });

      // همه‌ی شیت‌های کاندید را موازی بگیر؛ هر کدام که بود نمایش داده می‌شود
      const jobs = candidates.map(name =>
        fetch("data/" + encodeURIComponent(name) + ".json?t=" + Date.now(), { cache: "no-store" })
          .then(res => (res.ok ? res.json() : null))
          .then(data => ({ name: name, data: data }))
          .catch(() => ({ name: name, data: null }))
      );
      return Promise.all(jobs);
    })
    .then(results => {
      const obj = {};
      let found = false;
      results.forEach(({ name, data }) => {
        if (data && Array.isArray(data.rows) && data.rows.length) {
          obj[name] = data;
          found = true;
        }
      });
      if (found) { loadFromObject(obj, false); return; }
      // داده‌ی مشترک نیست → پیش‌نمایش محلی مرورگر
      const local = localStorage.getItem("mbf_sheets");
      if (local) {
        try {
          if (loadFromObject(JSON.parse(local), true)) return;
        } catch {}
      }
      emptyState.hidden = false;
    })
    .catch(() => {
      const local = localStorage.getItem("mbf_sheets");
      if (local) {
        try {
          if (loadFromObject(JSON.parse(local), true)) return;
        } catch {}
      }
      emptyState.hidden = false;
    });
})();
