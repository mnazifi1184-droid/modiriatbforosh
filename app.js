// منطق صفحه‌ی آپلود — نسخه‌ی چندشیتی (هر شیت فایل → یک فایل JSON در ریپو)
(function () {
  const REPO = "mnazifi1184-droid/modiriatbforosh";
  const API_BASE = "https://api.github.com/repos/" + REPO + "/contents/";
  const RAW_BASE = "https://mnazifi1184-droid.github.io/modiriatbforosh/";
  const TOKEN_KEY = "mbf_github_token";

  // شیت‌های مقصد پیش‌فرض — هم‌نام شیت‌های گوگل‌شیت
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
  let destinationNames = KNOWN_SHEETS.slice();
  let inProgress = false;

  // ---------- توکن ----------
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (savedToken) {
    tokenInput.value = savedToken;
    tokenStatus.textContent = "✓ توکن ذخیره شده — می‌توانید انتشار بدهید";
    tokenStatus.style.color = "var(--accent-dark)";
    publishInfo.hidden = true;
  }

  tokenSave.addEventListener("click", () => {
    const t = tokenInput.value.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    tokenStatus.textContent = "✓ توکن ذخیره شد — فقط در همین مرورگر";
    tokenStatus.style.color = "var(--accent-dark)";
    publishInfo.hidden = true;
  });

  async function testToken() {
    const t = (tokenInput.value || "").trim();
    if (!t) { tokenStatus.textContent = "اول توکن را وارد کنید."; tokenStatus.style.color = "var(--danger)"; return; }
    tokenStatus.textContent = "در حال تست…";
    tokenStatus.style.color = "var(--muted)";
    try {
      const res = await fetch("https://api.github.com/repos/" + REPO, {
        headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" }
      });
      if (res.ok) {
        const j = await res.json();
        const perm = j.permissions && j.permissions.push ? "دارید" : "ندارید";
        tokenStatus.textContent = "✓ توکن معتبر است — دسترسی push: " + perm;
        tokenStatus.style.color = "var(--accent-dark)";
      } else if (res.status === 401) {
        tokenStatus.textContent = "✗ توکن نامعتبر است (401) — احتمالاً ناقص کپی شده یا باطل شده.";
        tokenStatus.style.color = "var(--danger)";
      } else if (res.status === 403) {
        tokenStatus.textContent = "⚠ پاسخ 403 — یا توکن دسترسی ریپو ندارد یا api.github.com از شبکه‌ی شما مسدود است.";
        tokenStatus.style.color = "var(--danger)";
      } else {
        tokenStatus.textContent = "پاسخ غیرمنتظره: " + res.status;
        tokenStatus.style.color = "var(--danger)";
      }
    } catch {
      tokenStatus.textContent = "✗ ارتباط با api.github.com برقرار نشد — اینترنت شما به گیت‌هاب نمی‌رسد.";
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
    const el = type === "error" ? msgError : msgSuccess;
    showMsg(el, text);
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
        const isCsv = /\.csv$/i.test(file.name);
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        if (!wb.SheetNames.length) { setStatus("error", "فایل هیچ شیتی ندارد."); resetSelection(); return; }

        parsedSheets = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
          // حذف ردیف‌های کاملاً خالی انتهایی
          while (rows.length && Object.values(rows[rows.length - 1]).every(v => String(v == null ? "" : v).trim() === "")) rows.pop();
          const columns = rows.length ? Object.keys(rows[0]) : [];
          return { name: name, columns: columns, rows: rows };
        });

        // شیت‌های فایل هم به فهرست مقصدها اضافه می‌شوند
        destinationNames = KNOWN_SHEETS.slice();
        parsedSheets.forEach(s => {
          if (!destinationNames.includes(s.name)) destinationNames.push(s.name);
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

      // نام شیت
      const nameTd = document.createElement("td");
      nameTd.innerHTML = '<span class="sheet-name">' + escapeHtml(info.name) + "</span>" +
        (matched ? '<span class="auto-badge">هم‌نام</span>' : "");
      tr.appendChild(nameTd);

      // تعداد ردیف‌ها
      const rowsTd = document.createElement("td");
      if (info.rows.length > MAX_ROWS) {
        rowsTd.innerHTML = '<span class="row-err">' + toFa(info.rows.length) + " — بیش از حد مجاز</span>";
      } else {
        rowsTd.textContent = toFa(info.rows.length);
      }
      tr.appendChild(rowsTd);

      // شیت مقصد
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

      // حالت درج
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

      // وضعیت
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
      local[s.name] = { meta: { name: selectedFile.name, sheet: s.name, updated: new Date().toISOString() }, columns: s.columns, rows: s.rows };
    });
    localStorage.setItem("mbf_sheets", JSON.stringify(local));
    localStorage.removeItem("mbf_preview_only");
    location.href = "view.html";
  });

  // ---------- انتشار برای همه (GitHub API) ----------
  function ghHeaders(token) {
    return { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  }

  async function getFileSha(token, path) {
    const res = await fetch(API_BASE + path, { headers: ghHeaders(token) });
    if (res.ok) return (await res.json()).sha;
    if (res.status === 404) return null;
    throw new Error("http " + res.status);
  }

  async function putFile(token, path, contentObj, message) {
    const sha = await getFileSha(token, path);
    const body = {
      message: message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2)))),
      branch: "main"
    };
    if (sha) body.sha = sha;
    const res = await fetch(API_BASE + path, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error("http " + res.status);
  }

  async function fetchExistingRows(target) {
    // خواندن داده‌ی فعلی شیت مقصد از سایت منتشرشده (بدون توکن)
    const res = await fetch("data/" + encodeURIComponent(target) + ".json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rows) ? j.rows : [];
  }

  btnPublish.addEventListener("click", async () => {
    if (inProgress) return;
    const token = (tokenInput.value || "").trim();
    if (!token) {
      publishInfo.hidden = false;
      tokenInput.focus();
      setStatus("error", "برای انتشار مشترک، اول توکن گیت‌هاب را وارد کنید (بخش تنظیمات مدیر).");
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
      setStatus("loading", "در حال انتشار شیت «" + task.target + "» (" + toFa(t + 1) + " از " + toFa(tasks.length) + ")…");
      try {
        let rows = task.data.rows;
        if (task.mode === "append") {
          const existing = await fetchExistingRows(task.target);
          rows = existing.concat(task.data.rows);
        }
        const payload = {
          meta: { name: selectedFile.name, sheet: task.target, mode: task.mode, updated: new Date().toISOString() },
          columns: task.data.columns,
          rows: rows
        };
        await putFile(
          token,
          "data/" + encodeURIComponent(task.target) + ".json",
          payload,
          "به‌روزرسانی شیت " + task.target + " (" + task.mode + ") از فایل " + selectedFile.name
        );
        setRowStatus(task.index, "success", "✔ " + toFa(task.data.rows.length) + " ردیف درج شد");
        okCount++;
      } catch (err) {
        const msg = String(err && err.message || "");
        let text = "خطا: " + (msg || "نامشخص");
        if (msg === "http 401" || msg === "http 403") text = "خطا: توکن معتبر نیست یا دسترسی نوشتن ندارد";
        if (msg === "http 404" && !task.allowCreate) text = "خطا: شیت مقصد پیدا نشد";
        setRowStatus(task.index, "error", text);
        failCount++;
      }
    }

    // به‌روزرسانی مانیفست فهرست شیت‌ها
    try {
      setStatus("loading", "در حال به‌روزرسانی فهرست شیت‌ها…");
      let manifest = { sheets: {} };
      try {
        const mres = await fetch("data/sheets.json?t=" + Date.now(), { cache: "no-store" });
        if (mres.ok) { const mj = await mres.json(); if (mj && mj.sheets) manifest = mj; }
      } catch {}
      tasks.forEach(task => {
        manifest.sheets[task.target] = { updated: new Date().toISOString(), rows: (task.mode === "append" ? "append" : task.data.rows.length), file: selectedFile.name };
      });
      await putFile(token, "data/sheets.json", manifest, "به‌روزرسانی فهرست شیت‌ها");
    } catch {
      // مانیفست حیاتی نیست؛ صفحه‌ی نمایش شیت‌های شناخته‌شده را مستقیم هم امتحان می‌کند
    }

    inProgress = false;
    btnPublish.disabled = false;
    btnPublish.textContent = "انتشار برای همه";

    if (failCount === 0) {
      // ذخیره‌ی محلی برای پیش‌نمایش فوری
      const local = {};
      parsedSheets.forEach(s => {
        local[s.name] = { meta: { name: selectedFile.name, sheet: s.name, updated: new Date().toISOString() }, columns: s.columns, rows: s.rows };
      });
      localStorage.setItem("mbf_sheets", JSON.stringify(local));
      localStorage.setItem("mbf_preview_only", "1");
      setStatus("success", "✓ انتشار موفق! تا یک دقیقه دیگر برای همه نمایش داده می‌شود.");
      setTimeout(() => (location.href = "view.html"), 1500);
    } else if (okCount > 0) {
      setStatus("error", "انتشار ناقص بود: " + toFa(okCount) + " شیت موفق، " + toFa(failCount) + " شیت ناموفق. جزئیات در جدول بالا.");
    } else {
      setStatus("error", "انتشار ناموفق بود. توکن و اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.");
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
