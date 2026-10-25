// منطق صفحه‌ی آپلود — انتشار مستقیم به گوگل‌شیت از طریق Apps Script
(function () {
  const SERVICE_KEY = "mbf_script_url"; // آدرس سرویس Apps Script فقط در مرورگر مدیر

  const KNOWN_SHEETS = ["Products", "Barcod", "Pak", "Omr", "Endmonth"];

  const MAX_MB = 5;
  const OK_EXT = ["xlsx", "xls", "csv"];
  const MAX_ROWS = 100000;

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const chip = document.getElementById("file-chip");
  const chipName = document.getElementById("chip-name");
  const chipSize = document.getElementById("chip-size");
  const chipRemove = document.getElementById("chip-remove");
  const msgError = document.getElementById("msg-error");
  const msgSuccess = document.getElementById("msg-success");
  const btnView = document.getElementById("btn-view");
  const btnPublish = document.getElementById("btn-publish");
  const tokenInput = document.getElementById("token-input");
  const tokenSave = document.getElementById("token-save");
  const tokenTest = document.getElementById("token-test");
  const tokenStatus = document.getElementById("token-status");
  const publishInfo = document.getElementById("publish-info");
  const mappingBox = document.getElementById("mapping-box");
  const mappingBody = document.getElementById("mapping-body");
  const mappingFile = document.getElementById("mapping-file");

  let selectedFile = null;
  let parsedSheets = []; // [{name, columns, rows}]
  let inProgress = false;

  // ---------- آدرس سرویس ----------
  const savedUrl = localStorage.getItem(SERVICE_KEY);
  if (savedUrl) {
    tokenInput.value = savedUrl;
    tokenStatus.textContent = "✓ آدرس سرویس ذخیره شده — می‌توانید انتشار بدهید";
    tokenStatus.style.color = "var(--accent-dark)";
    publishInfo.hidden = true;
  }

  tokenSave.addEventListener("click", () => {
    const t = tokenInput.value.trim();
    if (!t) return;
    localStorage.setItem(SERVICE_KEY, t);
    tokenStatus.textContent = "✓ آدرس سرویس ذخیره شد — فقط در همین مرورگر";
    tokenStatus.style.color = "var(--accent-dark)";
    publishInfo.hidden = true;
  });

  async function testToken() {
    const t = (tokenInput.value || "").trim();
    if (!t) { tokenStatus.textContent = "اول آدرس سرویس را وارد کنید."; tokenStatus.style.color = "var(--danger)"; return; }
    tokenStatus.textContent = "در حال تست…";
    tokenStatus.style.color = "var(--muted)";
    try {
      const res = await fetch(t, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "ping" })
      });
      if (!res.ok) {
        tokenStatus.textContent = "پاسخ غیرمنتظره: " + res.status + " — مطمئن شوید استقرار «Anyone» است.";
        tokenStatus.style.color = "var(--danger)";
        return;
      }
      const j = await res.json();
      if (j.success) {
        tokenStatus.textContent = "✓ سرویس وصل است — " + (j.sheets ? j.sheets.length : 0) + " شیت پیدا شد.";
        tokenStatus.style.color = "var(--accent-dark)";
      } else {
        tokenStatus.textContent = "سرویس پاسخ داد ولی خطا دارد: " + (j.error || "نامشخص");
        tokenStatus.style.color = "var(--danger)";
      }
    } catch {
      tokenStatus.textContent = "✗ ارتباط با script.google.com برقرار نشد — اینترنت/VPN را بررسی کنید.";
      tokenStatus.style.color = "var(--danger)";
    }
  }
  tokenTest.addEventListener("click", testToken);

  // ---------- پیام‌ها ----------
  function showMsg(el, text) {
    [msgError, msgSuccess].forEach(m => (m.hidden = true));
    el.textContent = text;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setStatus(type, text) {
    showMsg(type === "error" ? msgError : msgSuccess, text);
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return toFa(bytes) + " بایت";
    if (bytes < 1024 * 1024) return toFa((bytes / 1024).toFixed(1)) + " کیلوبایت";
    return toFa((bytes / (1024 * 1024)).toFixed(2)) + " مگابایت";
  }

  function toFa(n) {
    return String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function resetSelection() {
    selectedFile = null;
    parsedSheets = [];
    fileInput.value = "";
    chip.hidden = true;
    mappingBox.hidden = true;
    btnView.disabled = true;
    btnPublish.disabled = true;
    [msgError, msgSuccess].forEach(m => (m.hidden = true));
  }

  // ---------- اعتبارسنجی و پارس ----------
  function validate(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!OK_EXT.includes(ext)) {
      setStatus("error", "فرمت فایل مجاز نیست. فقط xlsx، xls و csv پذیرفته می‌شود.");
      return false;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setStatus("error", "حجم فایل بیشتر از " + MAX_MB + " مگابایت است.");
      return false;
    }
    return true;
  }

  function setFile(file) {
    resetSelection();
    if (!validate(file)) return;
    selectedFile = file;
    chipName.textContent = file.name;
    chipSize.textContent = fmtSize(file.size);
    chip.hidden = false;
    setStatus("loading", "در حال خواندن فایل…");
    const reader = new FileReader();
    reader.onerror = () => { setStatus("error", "خواندن فایل ناموفق بود."); resetSelection(); };
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        if (!wb.SheetNames.length) { setStatus("error", "فایل هیچ شیتی ندارد."); resetSelection(); return; }

        parsedSheets = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
          while (rows.length && rows[rows.length - 1].every(v => String(v == null ? "" : v).trim() === "")) rows.pop();
          return { name: name, rows: rows };
        });

        renderMapping();
        btnView.disabled = false;
        btnPublish.disabled = false;
        setStatus("success", "فایل خوانده شد: " + toFa(parsedSheets.length) + " شیت. برای هر شیت مقصد و حالت درج را مشخص کنید.");
      } catch {
        setStatus("error", "پردازش فایل ناموفق بود؛ فایل اکسل سالم نیست.");
        resetSelection();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- جدول نگاشت ----------
  function renderMapping() {
    mappingBody.innerHTML = "";
    mappingFile.textContent = selectedFile ? selectedFile.name : "";
    if (!parsedSheets.length) { mappingBox.hidden = true; return; }
    mappingBox.hidden = false;

    parsedSheets.forEach((info, index) => {
      const matched = KNOWN_SHEETS.includes(info.name);
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.innerHTML = '<span class="sheet-name">' + escapeHtml(info.name) + "</span>" +
        (matched ? '<span class="auto-badge">هم‌نام</span>' : "");
      tr.appendChild(nameTd);

      const rowsTd = document.createElement("td");
      if (info.rows.length > MAX_ROWS) {
        rowsTd.innerHTML = '<span class="row-err">' + toFa(info.rows.length) + " — بیش از حد مجاز</span>";
      } else {
        rowsTd.textContent = toFa(info.rows.length);
      }
      tr.appendChild(rowsTd);

      const destTd = document.createElement("td");
      if (matched) {
        destTd.innerHTML = '<span class="sheet-name">' + escapeHtml(info.name) + "</span>";
      } else {
        const destSelect = document.createElement("select");
        destSelect.id = "dest_" + index;
        const skipOpt = document.createElement("option");
        skipOpt.value = ""; skipOpt.textContent = "— نادیده گرفتن —";
        destSelect.appendChild(skipOpt);
        const newOpt = document.createElement("option");
        newOpt.value = "__new__"; newOpt.textContent = "شیت جدید با همین نام";
        destSelect.appendChild(newOpt);
        KNOWN_SHEETS.forEach(n => {
          const o = document.createElement("option");
          o.value = n; o.textContent = n;
          destSelect.appendChild(o);
        });
        destTd.appendChild(destSelect);
      }
      tr.appendChild(destTd);

      const modeTd = document.createElement("td");
      const modeSelect = document.createElement("select");
      modeSelect.id = "mode_" + index;
      [["replace", "جایگزینی کامل"], ["append", "افزودن به انتها"], ["skip", "درج نشود"]].forEach(([v, t]) => {
        const o = document.createElement("option");
        o.value = v; o.textContent = t;
        modeSelect.appendChild(o);
      });
      modeSelect.value = matched ? "replace" : "skip";
      modeTd.appendChild(modeSelect);
      tr.appendChild(modeTd);

      const statusTd = document.createElement("td");
      statusTd.id = "rowstatus_" + index;
      statusTd.className = "row-status";
      statusTd.textContent = "—";
      tr.appendChild(statusTd);

      mappingBody.appendChild(tr);
    });
  }

  function setRowStatus(index, type, text) {
    const cell = document.getElementById("rowstatus_" + index);
    if (!cell) return;
    cell.className = "row-status " + type;
    cell.textContent = text;
  }

  // ---------- پیش‌نمایش محلی ----------
  btnView.addEventListener("click", () => {
    if (!parsedSheets.length) return;
    const local = {};
    parsedSheets.forEach(s => {
      const rows = s.rows.slice(1).map(r => {
        const obj = {};
        (s.rows[0] || []).forEach((h, i) => { obj[String(h || "ستون " + (i + 1))] = r[i] === undefined ? "" : String(r[i]); });
        return obj;
      });
      local[s.name] = { meta: { name: selectedFile.name, sheet: s.name, updated: new Date().toISOString() }, columns: (s.rows[0] || []).map(String), rows: rows };
    });
    localStorage.setItem("mbf_sheets", JSON.stringify(local));
    location.href = "view.html";
  });

  // ---------- انتشار مستقیم به گوگل‌شیت ----------
  async function callService(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      // Content-Type ساده تا درخواست preflight (OPTIONS) راه نیفتد —
      // Apps Script درخواست preflight را جواب نمی‌دهد
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("http " + res.status);
    const j = await res.json();
    if (!j.success) throw new Error(j.error || "خطای نامشخص سرویس");
    return j;
  }

  btnPublish.addEventListener("click", async () => {
    if (inProgress) return;
    const serviceUrl = (tokenInput.value || "").trim();
    if (!serviceUrl) {
      publishInfo.hidden = false;
      tokenInput.focus();
      setStatus("error", "برای انتشار، اول آدرس سرویس Apps Script را در تنظیمات مدیر وارد کنید.");
      return;
    }
    if (!parsedSheets.length) return;

    // ساخت لیست کارها از جدول نگاشت
    const tasks = [];
    const replaceTargets = [];
    for (let i = 0; i < parsedSheets.length; i++) {
      const modeSel = document.getElementById("mode_" + i);
      const mode = modeSel ? modeSel.value : "skip";
      if (mode === "skip") continue;

      const info = parsedSheets[i];
      const matched = KNOWN_SHEETS.includes(info.name);
      let target = info.name;
      let allowCreate = false;

      if (!matched) {
        const destSel = document.getElementById("dest_" + i);
        const dest = destSel ? destSel.value : "";
        if (!dest) continue;
        if (dest === "__new__") { allowCreate = true; }
        else { target = dest; }
      }

      // اگر شیت مقصد در گوگل‌شیت وجود نداشت، خودکار ساخته می‌شود —
      // نیازی به ساخت دستی شیت نیست
      allowCreate = true;

      if (info.rows.length > MAX_ROWS) {
        setRowStatus(i, "error", "بیش از " + toFa(MAX_ROWS) + " ردیف");
        continue;
      }
      if (!info.rows.length) {
        setRowStatus(i, "error", "شیت خالی است");
        continue;
      }

      if (mode === "replace" && replaceTargets.indexOf(target) === -1) replaceTargets.push(target);
      tasks.push({ index: i, target: target, mode: mode, allowCreate: allowCreate, data: info });
    }

    if (!tasks.length) {
      setStatus("error", "هیچ شیتی برای درج انتخاب نشده است.");
      return;
    }

    if (replaceTargets.length) {
      const ok = confirm(
        "محتوای کامل این شیت‌ها پاک و جایگزین می‌شود:\n\n" +
        replaceTargets.join("\n") +
        "\n\nادامه می‌دهید؟"
      );
      if (!ok) return;
    }

    inProgress = true;
    btnPublish.disabled = true;
    btnPublish.textContent = "در حال انتشار…";

    let okCount = 0;
    let failCount = 0;

    for (let t = 0; t < tasks.length; t++) {
      const task = tasks[t];
      setRowStatus(task.index, "running", "در حال درج…");
      setStatus("loading", "در حال درج شیت «" + task.target + "» (" + toFa(t + 1) + " از " + toFa(tasks.length) + ")…");
      try {
        const result = await callService(serviceUrl, {
          action: "import",
          rows: task.data.rows,
          targetSheet: task.target,
          mode: task.mode,
          allowCreate: task.allowCreate
        });
        setRowStatus(task.index, "success", "✔ " + toFa(result.rows || task.data.rows.length) + " ردیف درج شد");
        okCount++;
      } catch (err) {
        setRowStatus(task.index, "error", "خطا: " + String(err && err.message || "نامشخص"));
        failCount++;
      }
    }

    inProgress = false;
    btnPublish.disabled = false;
    btnPublish.textContent = "انتشار برای همه";

    if (failCount === 0) {
      setStatus("success", "✓ درج در گوگل‌شیت تمام شد! صفحه‌ی نمایش را دوباره باز کنید تا داده‌های جدید را ببینید.");
    } else if (okCount > 0) {
      setStatus("error", "درج ناقص بود: " + toFa(okCount) + " شیت موفق، " + toFa(failCount) + " شیت ناموفق. جزئیات در جدول بالا.");
    } else {
      setStatus("error", "درج ناموفق بود. آدرس سرویس، استقرار «Anyone» و اتصال VPN را بررسی کنید.");
    }
  });

  // ---------- رویدادهای آپلود ----------
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) setFile(fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("dragover"); })
  );
  dropzone.addEventListener("drop", e => {
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  });
  chipRemove.addEventListener("click", resetSelection);
})();
