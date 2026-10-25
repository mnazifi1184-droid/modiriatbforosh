// منطق صفحه‌ی آپلود اکسل
(function () {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const chip = document.getElementById("file-chip");
  const chipName = document.getElementById("chip-name");
  const chipSize = document.getElementById("chip-size");
  const chipRemove = document.getElementById("chip-remove");
  const msgError = document.getElementById("msg-error");
  const msgSuccess = document.getElementById("msg-success");
  const btnView = document.getElementById("btn-view");

  const MAX_MB = 5;
  const OK_EXT = ["xlsx", "xls", "csv"];
  let selectedFile = null;

  function showMsg(el, text) {
    [msgError, msgSuccess].forEach(m => (m.hidden = true));
    el.textContent = text;
    el.hidden = false;
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " بایت";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " کیلوبایت";
    return (bytes / (1024 * 1024)).toFixed(2) + " مگابایت";
  }

  function resetSelection() {
    selectedFile = null;
    fileInput.value = "";
    chip.hidden = true;
    btnView.disabled = true;
    [msgError, msgSuccess].forEach(m => (m.hidden = true));
  }

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
    btnView.disabled = false;
  }

  // رویدادها
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

  btnView.addEventListener("click", () => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onerror = () => showMsg(msgError, "خواندن فایل ناموفق بود؛ دوباره تلاش کنید.");
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        // اولین شیت
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
        if (!rows.length) {
          showMsg(msgError, "فایل خالی است یا سطر داده‌ای ندارد.");
          return;
        }
        localStorage.setItem("mbf_data", JSON.stringify(rows));
        localStorage.setItem("mbf_meta", JSON.stringify({
          name: selectedFile.name,
          size: selectedFile.size,
          sheet: sheetName,
          count: rows.length,
          at: Date.now()
        }));
        location.href = "view.html";
      } catch (err) {
        showMsg(msgError, "پردازش فایل ناموفق بود؛ مطمئن شوید فایل اکسل سالم است.");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  });
})();
