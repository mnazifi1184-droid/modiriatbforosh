// منطق صفحه‌ی نمایش — داده‌ی مشترک از data/data.json
(function () {
  const content = document.getElementById("content");
  const emptyState = document.getElementById("empty-state");
  const fileName = document.getElementById("file-name");
  const fileMeta = document.getElementById("file-meta");
  const rowBadge = document.getElementById("row-badge");
  const search = document.getElementById("search");
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("table-body");

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

  function showShared(data) {
    allRows = data.rows || [];
    content.hidden = false;
    fileName.textContent = (data.meta && data.meta.name) || "نامشخص";
    if (fileMeta && data.meta && data.meta.updated) {
      const d = new Date(data.meta.updated);
      fileMeta.textContent = " — آخرین به‌روزرسانی: " + d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    }
    applyFilter();
    search.addEventListener("input", applyFilter);
  }

  // اول داده‌ی مشترک را از ریپو بخوان
  fetch("data/data.json?t=" + Date.now(), { cache: "no-store" })
    .then(res => {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    })
    .then(data => {
      if (!data.rows || !data.rows.length) throw new Error("empty");
      showShared(data);
    })
    .catch(() => {
      // جایگزین: داده‌ی محلی مرورگر (اگر مدیر همین‌جا پیش‌نمایش گرفته)
      const local = localStorage.getItem("mbf_data");
      const meta = JSON.parse(localStorage.getItem("mbf_meta") || "null");
      if (local) {
        try {
          showShared({ rows: JSON.parse(local), meta: meta || {} });
          if (fileMeta) fileMeta.textContent = " (پیش‌نمایش محلی — برای همه منتشر نشده)";
          return;
        } catch {}
      }
      emptyState.hidden = false;
    });
})();
