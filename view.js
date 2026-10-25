// منطق صفحه‌ی نمایش داده‌ها
(function () {
  const content = document.getElementById("content");
  const emptyState = document.getElementById("empty-state");
  const fileName = document.getElementById("file-name");
  const rowBadge = document.getElementById("row-badge");
  const search = document.getElementById("search");
  const btnDelete = document.getElementById("btn-delete");
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("table-body");

  let rows = [];

  function toFa(n) {
    return Number(n).toLocaleString("fa-IR");
  }

  function render() {
    thead.innerHTML = "";
    tbody.innerHTML = "";

    if (!rows.length) {
      thead.innerHTML = "<tr><th>—</th></tr>";
      tbody.innerHTML = '<tr><td style="color:var(--muted)">موردی مطابق جستجو پیدا نشد.</td></tr>';
      return;
    }

    // سرستون‌ها از کلیدهای اولین ردیف
    const cols = Object.keys(rows[0]);
    thead.innerHTML = "<tr>" + cols.map(c => "<th>" + escapeHtml(c) + "</th>").join("") + "</tr>";

    tbody.innerHTML = rows
      .map(r =>
        "<tr>" +
        cols.map(c => {
          const v = r[c] === undefined || r[c] === null ? "" : String(r[c]);
          const isNum = v !== "" && !isNaN(v);
          return "<td" + (isNum ? ' class="num"' : "") + ">" + escapeHtml(v) + "</td>";
        }).join("") +
        "</tr>"
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const all = JSON.parse(localStorage.getItem("mbf_data") || "[]");
    if (!q) { rows = all; }
    else {
      rows = all.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(q))
      );
    }
    rowBadge.textContent = q
      ? toFa(rows.length) + " از " + toFa(all.length) + " سطر"
      : toFa(all.length) + " سطر";
    render();
  }

  // شروع
  const data = localStorage.getItem("mbf_data");
  const meta = JSON.parse(localStorage.getItem("mbf_meta") || "null");

  if (!data || !meta) {
    emptyState.hidden = false;
  } else {
    rows = JSON.parse(data);
    content.hidden = false;
    fileName.textContent = meta.name;
    rowBadge.textContent = toFa(rows.length) + " سطر";
    render();

    search.addEventListener("input", applyFilter);
    btnDelete.addEventListener("click", () => {
      if (confirm("همه‌ی داده‌های بارگذاری‌شده حذف شود؟")) {
        localStorage.removeItem("mbf_data");
        localStorage.removeItem("mbf_meta");
        location.reload();
      }
    });
  }
})();
