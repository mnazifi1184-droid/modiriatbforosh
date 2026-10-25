// منطق صفحه‌ی آپلود — نسخه‌ی مشترک (انتشار از طریق GitHub)
(function () {
  const REPO = "mnazifi1184-droid/modiriatbforosh";
  const DATA_PATH = "data/data.json";
  const TOKEN_KEY = "mbf_github_token"; // فقط در مرورگر مدیر ذخیره می‌شود

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
  const tokenBox = document.getElementById("token-box");
  const tokenInput = document.getElementById("token-input");
  const tokenSave = document.getElementById("token-save");
  const tokenTest = document.getElementById("token-test");
  const tokenStatus = document.getElementById("token-status");
  const publishInfo = document.getElementById("publish-info");

  const MAX_MB = 5;
  const OK_EXT = ["xlsx", "xls", "csv"];
  let selectedFile = null;
  let parsedRows = null;
  let parsedMeta = null;

  // ---------- توکن ----------
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (savedToken) {
    tokenInput.value = savedToken;
    tokenStatus.textContent = "✓ توکن ذخیره شده — می‌توانید انتشار بدهید";
    tokenStatus.style.color = "var(--accent-dark)";
  } else {
    publishInfo.hidden = false;
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
      const res = await fetch(`https://api.github.com/repos/${REPO}`, {
        headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" }
      });
      if (res.ok) {
        const j = await res.json();
        const perm = j.permissions && j.permissions.push ? "دارید" : "ندارید";
        tokenStatus.textContent = `✓ توکن معتبر است — دسترسی push: ${perm}`;
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

  function fmtSize(bytes) {
    if (bytes < 1024) return toFa(bytes) + " بایت";
    if (bytes < 1024 * 1024) return toFa((bytes / 1024).toFixed(1)) + " کیلوبایت";
    return toFa((bytes / (1024 * 1024)).toFixed(2)) + " مگابایت";
  }

  function toFa(n) {
    return String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function resetSelection() {
    selectedFile = null;
    parsedRows = null;
    parsedMeta = null;
    fileInput.value = "";
    chip.hidden = true;
    btnView.disabled = true;
    btnPublish.disabled = true;
    [msgError, msgSuccess].forEach(m => (m.hidden = true));
  }

  // ---------- اعتبارسنجی و پیش‌پردازش ----------
  function validate(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!OK_EXT.includes(ext)) {
      showMsg(msgError, "فرمت فایل مجاز نیست. فقط xlsx، xls و csv پذیرفته می‌شود.");
      return false;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      showMsg(msgError, "حجم فایل بیشتر از " + MAX_MB + " مگابایت است.");
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
    // پیش‌خوانی فایل برای انتشار مشترک
    const reader = new FileReader();
    reader.onerror = () => { showMsg(msgError, "خواندن فایل ناموفق بود."); resetSelection(); };
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
        if (!rows.length) { showMsg(msgError, "فایل خالی است."); resetSelection(); return; }
        parsedRows = rows;
        parsedMeta = { name: file.name, sheet: sheetName, updated: new Date().toISOString() };
        btnView.disabled = false;
        btnPublish.disabled = false;
      } catch {
        showMsg(msgError, "پردازش فایل ناموفق بود؛ فایل اکسل سالم نیست.");
        resetSelection();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- پیش‌نمایش محلی ----------
  btnView.addEventListener("click", () => {
    if (!parsedRows) return;
    localStorage.setItem("mbf_data", JSON.stringify(parsedRows));
    localStorage.setItem("mbf_meta", JSON.stringify(parsedMeta));
    location.href = "view.html";
  });

  // ---------- انتشار برای همه (GitHub API) ----------
  btnPublish.addEventListener("click", async () => {
    const token = (tokenInput.value || "").trim();
    if (!token) {
      publishInfo.hidden = false;
      tokenInput.focus();
      showMsg(msgError, "برای انتشار مشترک، اول توکن گیت‌هاب را وارد کنید.");
      return;
    }
    if (!parsedRows) return;

    btnPublish.disabled = true;
    btnPublish.textContent = "در حال انتشار…";

    try {
      // sha فایل فعلی برای آپدیت
      let sha = undefined;
      const head = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
      );
      if (head.ok) sha = (await head.json()).sha;

      const body = {
        message: "به‌روزرسانی داده‌های فروش از فایل " + parsedMeta.name,
        content: btoa(unescape(encodeURIComponent(JSON.stringify({
          meta: parsedMeta,
          columns: Object.keys(parsedRows[0]),
          rows: parsedRows
        }, null, 2)))),
        branch: "main"
      };
      if (sha) body.sha = sha;

      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      );

      if (res.ok) {
        showMsg(msgSuccess, "✓ انتشار موفق! تا یک دقیقه دیگر برای همه نمایش داده می‌شود.");
        localStorage.setItem("mbf_data", JSON.stringify(parsedRows));
        localStorage.setItem("mbf_meta", JSON.stringify(parsedMeta));
        setTimeout(() => (location.href = "view.html"), 1500);
      } else if (res.status === 401 || res.status === 403) {
        showMsg(msgError, "توکن معتبر نیست یا دسترسی نوشتن به ریپو ندارد.");
        btnPublish.disabled = false;
        btnPublish.textContent = "انتشار برای همه";
      } else {
        showMsg(msgError, "انتشار ناموفق بود (کد " + res.status + "). دوباره تلاش کنید.");
        btnPublish.disabled = false;
        btnPublish.textContent = "انتشار برای همه";
      }
    } catch {
      showMsg(msgError, "ارتباط با گیت‌هاب برقرار نشد؛ اینترنت را بررسی کنید.");
      btnPublish.disabled = false;
      btnPublish.textContent = "انتشار برای همه";
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
