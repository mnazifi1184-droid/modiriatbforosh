// صفحه‌ی دیجی کالا — آپلود اکسل و ذخیره در دیتابیس اختصاصی برنامه
(function () {
  const USER_KEY = "mbf_user";
  const SESSION_KEY = "mbf_session";
  const APP_ID = "digikala";
  const STAMP = "__updated_at";

  // ---------- نگهبانی ----------
  const sessionKey = localStorage.getItem(SESSION_KEY);
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) {}
  if (!sessionKey || !currentUser) { location.href = "login.html"; return; }

  const perms = userPerms(currentUser);

  // ---------- دیتاست‌های این برنامه (id = id شاخه در apps-config) ----------
  const DATASETS = [
    { id: "stock-ikco",  title: "موجودی ایرانخودرو", icon: "🚗", keyHint: "معمولاً «کد قطعه» یا «کد کالا»" },
    { id: "stock-saipa", title: "موجودی سایپا",      icon: "🚙", keyHint: "معمولاً «کد قطعه» یا «کد کالا»" },
    { id: "dk-reports",  title: "گزارش دیجی کالا",   icon: "📈", keyHint: "معمولاً «شناسه سفارش» یا «کد پیگیری»" }
  ];

  // ---------- عناصر ----------
  const tabsEl = document.getElementById("dataset-tabs");
  const noAccess = document.getElementById("no-access");
  const bodyEl = document.getElementById("app-body");
  const msgError = document.getElementById("msg-error");
  const msgSuccess = document.getElementById("msg-success");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileChip = document.getElementById("file-chip");
  const chipName = document.getElementById("chip-name");
  const chipSize = document.getElementById("chip-size");
  const chipRemove = document.getElementById("chip-remove");
  const parseBox = document.getElementById("parse-box");
  const parsedSheetName = document.getElementById("parsed-sheet-name");
  const sourceSheetSel = document.getElementById("source-sheet");
  const keyColumnSel = document.getElementById("key-column");
  const previewTable = document.getElementById("preview-table");
  const btnSave = document.getElementById("btn-save");
  const saveHint = document.getElementById("save-hint");
  const storedMeta = document.getElementById("stored-meta");
  const storedWrap = document.getElementById("stored-wrap");
  const storedTable = document.getElementById("stored-table");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnExpand = document.getElementById("btn-expand");
  const storedBox = document.getElementById("stored-box");
  const finalBox = document.getElementById("final-box");
  const finalStats = document.getElementById("final-stats");
  const finalSearch = document.getElementById("final-search");
  const finalNote = document.getElementById("final-note");
  const finalWrap = document.getElementById("final-wrap");
  const finalTable = document.getElementById("final-table");
  const btnFinalRefresh = document.getElementById("btn-final-refresh");
  const btnFinalDownload = document.getElementById("btn-final-download");
  const btnFinalPrev = document.getElementById("btn-final-prev");
  const btnFinalNext = document.getElementById("btn-final-next");
  const finalPageInfo = document.getElementById("final-page-info");

  let currentDataset = null;
  let workbook = null;
  let parsed = null; // { columns, rows }

  // ---------- ناوبری ----------
  if (currentUser.permView || currentUser.isAdmin) document.getElementById("nav-view").hidden = false;
  if (currentUser.permUpload || currentUser.isAdmin) document.getElementById("nav-upload").hidden = false;
  if (currentUser.isAdmin) document.getElementById("nav-admin").hidden = false;
  document.getElementById("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = "login.html";
  });

  // ---------- ابزار ----------
  function showMsg(el, text) { el.textContent = text; el.hidden = false; }
  function hideMsgs() { msgError.hidden = true; msgSuccess.hidden = true; }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " بایت";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " کیلوبایت";
    return (bytes / 1048576).toFixed(1) + " مگابایت";
  }

  async function callService(payload) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const res = await fetch(window.mbfServiceUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
      if (!res.ok) throw new Error("خطای شبکه (" + res.status + ")");
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "خطای نامشخص سرویس");
      return j;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- شاخه‌های مجاز ----------
  const allowedSecs = allowedSections(perms, APP_ID).map(s => s.id);
  const myDatasets = DATASETS.filter(d => allowedSecs.indexOf(d.id) !== -1);

  if (!myDatasets.length) {
    noAccess.hidden = false;
    return;
  }
  bodyEl.hidden = false;

  // ---------- تب‌ها ----------
  let tabsHtml = myDatasets.map(d =>
    '<button class="tab" data-tab="' + d.id + '">' + d.icon + " " + d.title + "</button>"
  ).join("");
  /* تب گزارش نهایی — فقط برای کسی که به گزارش دیجی کالا دسترسی دارد */
  if (allowedSecs.indexOf("dk-reports") !== -1) {
    tabsHtml += '<button class="tab" data-tab="final-report">📋 گزارش نهایی</button>';
  }
  tabsEl.innerHTML = tabsHtml;
  tabsEl.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  function switchTab(id) {
    currentDataset = id;
    tabsEl.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
    hideMsgs();
    resetFile();
    const isFinal = id === "final-report";
    finalBox.hidden = !isFinal;
    dropzone.hidden = isFinal;
    storedBox.hidden = isFinal;
    btnExpand.hidden = true;
    if (isFinal) loadFinal();
    else loadStored();
  }

  function resetFile() {
    workbook = null;
    parsed = null;
    fileInput.value = "";
    fileChip.hidden = true;
    parseBox.hidden = true;
    btnSave.disabled = true;
    saveHint.textContent = "";
  }

  // ---------- پارس فایل ----------
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });
  chipRemove.addEventListener("click", resetFile);

  function handleFile(file) {
    hideMsgs();
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      showMsg(msgError, "فقط فایل xlsx، xls یا csv پذیرفته می‌شود.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        workbook = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        chipName.textContent = file.name;
        chipSize.textContent = fmtSize(file.size);
        fileChip.hidden = false;
        sourceSheetSel.innerHTML = workbook.SheetNames
          .map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + "</option>").join("");
        parseBox.hidden = false;
        parsedSheetName.textContent = workbook.SheetNames[0] || "—";
        parseSheet(workbook.SheetNames[0]);
      } catch (err) {
        showMsg(msgError, "خواندن فایل ناموفق بود: " + (err && err.message));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseSheet(name) {
    const ws = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) || [];
    if (!grid.length) {
      parsed = { columns: [], rows: [] };
      keyColumnSel.innerHTML = "";
      renderPreview();
      btnSave.disabled = true;
      saveHint.textContent = "این شیت خالی است.";
      return;
    }
    const columns = (grid[0] || []).map((h, i) => {
      const t = String(h == null ? "" : h).trim();
      return t || "ستون " + (i + 1);
    });
    const rows = grid.slice(1)
      .filter(r => r.some(c => String(c == null ? "" : c).trim() !== ""))
      .map(r => columns.map((_, i) => String(r[i] == null ? "" : r[i])));
    parsed = { columns: columns, rows: rows };

    const guess = columns.find(c => /کد|شناسه|id|بارکد|سریال/i.test(c)) || columns[0];
    keyColumnSel.innerHTML = columns
      .map(c => '<option value="' + escapeHtml(c) + '"' + (c === guess ? " selected" : "") + ">" + escapeHtml(c) + "</option>").join("");
    renderPreview();
    saveHint.textContent = parsed.rows.length + " ردیف آماده ذخیره — " + (DATASETS.find(d => d.id === currentDataset) || {}).keyHint;
    btnSave.disabled = !parsed.rows.length;
  }

  sourceSheetSel.addEventListener("change", () => {
    parsedSheetName.textContent = sourceSheetSel.value;
    parseSheet(sourceSheetSel.value);
  });

  function renderPreview() {
    const cols = parsed ? parsed.columns : [];
    const rows = parsed ? parsed.rows.slice(0, 8) : [];
    previewTable.querySelector("thead").innerHTML =
      "<tr>" + cols.map(c => "<th>" + escapeHtml(c) + "</th>").join("") + "</tr>";
    previewTable.querySelector("tbody").innerHTML = rows.length
      ? rows.map(r => "<tr>" + r.map(c => "<td>" + escapeHtml(c) + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + Math.max(cols.length, 1) + '" style="text-align:center; color:var(--muted)">ردیفی نیست</td></tr>';
  }

  // ---------- ذخیره ----------
  btnSave.addEventListener("click", async () => {
    if (currentDataset === "final-report") return;
    if (!parsed || !parsed.rows.length || !currentDataset) return;
    hideMsgs();
    btnSave.disabled = true;
    btnSave.textContent = "در حال ذخیره…";
    try {
      const j = await callService({
        action: "upsertDataRows",
        sessionKey: sessionKey,
        appId: APP_ID,
        dataset: currentDataset,
        keyColumn: keyColumnSel.value,
        columns: parsed.columns,
        rows: parsed.rows
      });
      showMsg(msgSuccess, "✓ ذخیره شد — جدید: " + j.inserted + " | به‌روزرسانی: " + j.updated +
        (j.skipped ? " | بدون کلید رد شد: " + j.skipped : "") +
        " | کل ردیف‌های دیتاست: " + j.total + " — دیتابیس: " + j.database);
      resetFile();
      loadStored();
    } catch (err) {
      showMsg(msgError, String(err && err.message) + " — اتصال به گوگل (در ایران معمولاً VPN) را بررسی کنید.");
      btnSave.disabled = false;
    } finally {
      btnSave.textContent = "ذخیره در دیتابیس برنامه";
    }
  });

  // ---------- داده‌های ذخیره‌شده ----------
  async function loadStored() {
    storedMeta.textContent = "در حال بارگیری…";
    storedWrap.hidden = true;
    try {
      const j = await callService({
        action: "readDataRows",
        sessionKey: sessionKey,
        appId: APP_ID,
        dataset: currentDataset
      });
      const cols = (j.columns || []).filter(c => c !== STAMP);
      if (!cols.length || !j.total) {
        storedMeta.textContent = "هنوز داده‌ای ذخیره نشده — اولین فایل را آپلود کنید.";
        return;
      }
      const idx = (j.columns || []).indexOf(STAMP);
      const rows = (j.rows || []).map(r => idx >= 0 ? r.slice(0, idx) : r).slice(-50);
      storedTable.querySelector("thead").innerHTML =
        "<tr>" + cols.map(c => "<th>" + escapeHtml(c) + "</th>").join("") + "</tr>";
      storedTable.querySelector("tbody").innerHTML = rows.map(r =>
        "<tr>" + cols.map((_, i) => "<td>" + escapeHtml(r[i] != null ? r[i] : "") + "</td>").join("") + "</tr>"
      ).join("");
      storedMeta.textContent = "۵۰ ردیف اخیر از " + Number(j.total).toLocaleString("fa-IR") + " ردیف — دیتابیس: " + j.database;
      storedWrap.hidden = false;
      btnExpand.hidden = currentDataset !== "dk-reports";
    } catch (err) {
      storedMeta.textContent = "بارگیری نشد: " + (err && err.message);
    }
  }

  btnRefresh.addEventListener("click", loadStored);

  // ---------- گسترش کدهای چندگانه (مثل SPLIT/FLATTEN اکسل) ----------
  btnExpand.addEventListener("click", async () => {
    hideMsgs();
    if (!confirm("به ازای هر کد داخل ستون «کد محصول فروشنده» یک ردیف جدا ساخته می‌شود و نتیجه در شیت dk-reports_split ذخیره می‌شود. ادامه می‌دهید؟")) return;
    btnExpand.disabled = true;
    btnExpand.textContent = "در حال گسترش…";
    try {
      const j = await callService({
        action: "expandSplitColumn",
        sessionKey: sessionKey,
        appId: APP_ID,
        dataset: currentDataset
      });
      showMsg(msgSuccess, "✓ گسترش انجام شد — ردیف ورودی: " + j.inputRows +
        " → خروجی: " + j.outputRows +
        " (حداکثر " + j.maxCodesPerRow + " کد در یک ردیف)" +
        (j.rowsWithoutCode ? " | بدون کد: " + j.rowsWithoutCode : "") +
        " — نتیجه در شیت «" + j.outputSheet + "» دیتابیس " + j.database);
    } catch (err) {
      showMsg(msgError, String(err && err.message));
    } finally {
      btnExpand.disabled = false;
      btnExpand.textContent = "⤵ گسترش کدها (SPLIT)";
    }
  });

  // ---------- گزارش نهایی (شیت dk-reports_split) ----------
  const FINAL_PAGE = 50;
  let finalData = { columns: [], rows: [] };
  let finalFiltered = [];
  let finalPage = 0;

  async function loadFinal() {
    finalStats.innerHTML = "";
    finalWrap.hidden = true;
    finalNote.textContent = "در حال بارگیری گزارش نهایی…";
    try {
      const j = await callService({
        action: "readDataRows",
        sessionKey: sessionKey,
        appId: APP_ID,
        dataset: "dk-reports_split",
        limit: 50000
      });
      finalData = { columns: j.columns || [], rows: (j.rows || []).map(r => r.map(x => x != null ? x : "")) };
      if (!finalData.columns.length || !finalData.rows.length) {
        finalNote.textContent = "هنوز گزارشی ساخته نشده — در تب «گزارش دیجی کالا» فایل را ذخیره کنید و دکمه‌ی «گسترش کدها» را بزنید.";
        return;
      }
      applyFinalFilter();
      finalNote.textContent = "منبع: شیت dk-reports_split — دیتابیس: " + j.database;
    } catch (err) {
      finalNote.textContent = "بارگیری نشد: " + (err && err.message);
    }
  }

  function applyFinalFilter() {
    const q = finalSearch.value.trim().toLowerCase();
    finalFiltered = !q ? finalData.rows.slice()
      : finalData.rows.filter(r => r.some(x => String(x).toLowerCase().indexOf(q) !== -1));
    const stampIdx = finalData.columns.indexOf("__updated_at");
    const codeIdx = finalData.columns.indexOf("کد محصول فروشنده");
    const codes = new Set();
    let lastStamp = "";
    finalFiltered.forEach(r => {
      if (codeIdx !== -1 && String(r[codeIdx]).trim()) codes.add(String(r[codeIdx]).trim());
      if (stampIdx !== -1 && String(r[stampIdx]) > lastStamp) lastStamp = String(r[stampIdx]);
    });
    finalStats.innerHTML =
      '<span class="stat-chip">ردیف‌ها<b>' + Number(finalFiltered.length).toLocaleString("fa-IR") + "</b></span>" +
      '<span class="stat-chip">کد یکتا<b>' + Number(codes.size).toLocaleString("fa-IR") + "</b></span>" +
      (lastStamp ? '<span class="stat-chip">آخرین به‌روزرسانی<b>' + escapeHtml(lastStamp) + "</b></span>" : "");
    finalPage = 0;
    renderFinalPage();
  }

  function renderFinalPage() {
    const stampIdx = finalData.columns.indexOf("__updated_at");
    const cols = finalData.columns.filter(c => c !== "__updated_at");
    const pages = Math.max(1, Math.ceil(finalFiltered.length / FINAL_PAGE));
    if (finalPage >= pages) finalPage = pages - 1;
    const slice = finalFiltered.slice(finalPage * FINAL_PAGE, (finalPage + 1) * FINAL_PAGE);
    finalTable.querySelector("thead").innerHTML =
      "<tr>" + cols.map(x => "<th>" + escapeHtml(x) + "</th>").join("") + "</tr>";
    finalTable.querySelector("tbody").innerHTML = slice.length
      ? slice.map(r => {
          const cells = stampIdx === -1 ? r : r.filter((_, i) => i !== stampIdx);
          return "<tr>" + cols.map((_, i) => "<td>" + escapeHtml(cells[i] != null ? cells[i] : "") + "</td>").join("") + "</tr>";
        }).join("")
      : '<tr><td colspan="' + Math.max(cols.length, 1) + '" style="text-align:center; color:var(--muted)">ردیفی مطابق جستجو پیدا نشد</td></tr>';
    finalPageInfo.textContent = "صفحه " + (finalPage + 1).toLocaleString("fa-IR") + " از " + pages.toLocaleString("fa-IR") + " — " + Number(finalFiltered.length).toLocaleString("fa-IR") + " ردیف";
    btnFinalPrev.disabled = finalPage === 0;
    btnFinalNext.disabled = finalPage >= pages - 1;
    finalWrap.hidden = false;
  }

  finalSearch.addEventListener("input", () => { finalPage = 0; applyFinalFilter(); });
  btnFinalPrev.addEventListener("click", () => { if (finalPage > 0) { finalPage--; renderFinalPage(); } });
  btnFinalNext.addEventListener("click", () => { finalPage++; renderFinalPage(); });
  btnFinalRefresh.addEventListener("click", loadFinal);
  btnFinalDownload.addEventListener("click", () => {
    if (!finalData.columns.length || !finalFiltered.length) return;
    const stampIdx = finalData.columns.indexOf("__updated_at");
    const cols = finalData.columns.filter(x => x !== "__updated_at");
    const data = [cols].concat(finalFiltered.map(r =>
      (stampIdx === -1 ? r : r.filter((_, i) => i !== stampIdx)).map(x => x != null ? x : "")
    ));
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "dk-reports-split");
    XLSX.writeFile(wb, "dk-reports-split-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  });

  // ---------- شروع ----------
  switchTab(myDatasets[0].id);
})();
