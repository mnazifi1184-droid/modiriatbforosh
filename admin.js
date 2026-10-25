// منطق صفحه‌ی مدیریت کاربران
(function () {
  const SERVICE_KEY = "mbf_script_url";
  const USER_KEY = "mbf_user";
  const SESSION_KEY = "mbf_session";

  const usersBody = document.getElementById("users-body");
  const errorMsg = document.getElementById("admin-error");
  const successMsg = document.getElementById("admin-success");
  const modal = document.getElementById("user-modal");
  const modalTitle = document.getElementById("user-modal-title");
  const form = document.getElementById("user-form");
  const formError = document.getElementById("user-form-error");
  const inUsername = document.getElementById("u-username");
  const inDisplay = document.getElementById("u-displayname");
  const inPassword = document.getElementById("u-password");
  const passwordField = document.getElementById("u-password-field");
  const passwordHint = document.getElementById("u-password-hint");
  const ckAdmin = document.getElementById("u-admin");
  const ckView = document.getElementById("u-view");
  const ckUpload = document.getElementById("u-upload");
  const ckActive = document.getElementById("u-active");

  let serviceUrl = localStorage.getItem(SERVICE_KEY) || "";
  let editingUser = null; // null = ایجاد، رشته = ویرایش

  function toFa(n) { return String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showMsg(el, text) {
    [errorMsg, successMsg].forEach(m => (m.hidden = true));
    el.textContent = text;
    el.hidden = false;
  }

  // ---------- نگهبانی سمت مرورگر ----------
  const sessionKey = localStorage.getItem(SESSION_KEY);
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch {}
  if (!sessionKey || !currentUser || !currentUser.isAdmin) {
    location.href = "login.html";
    return;
  }

  // ---------- ناوبری بر اساس دسترسی ----------
  if (!currentUser.permView) {
    document.querySelector('a[href="view.html"]').hidden = true;
  }
  if (!currentUser.permUpload && !currentUser.isAdmin) {
    document.querySelector('a[href="index.html"]').hidden = true;
  }

  document.getElementById("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = "login.html";
  });

  // ---------- ارتباط با سرویس ----------
  async function callService(payload) {
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ sessionKey: sessionKey }, payload))
    });
    if (!res.ok) throw new Error("http " + res.status);
    const j = await res.json();
    if (!j.success) {
      if (j.error && j.error.indexOf("مدیر") !== -1) {
        // نشست منقضی یا دسترسی از دست رفته
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(USER_KEY);
        location.href = "login.html";
        return;
      }
      throw new Error(j.error || "خطای نامشخص سرویس");
    }
    return j;
  }

  // ---------- فهرست کاربران ----------
  async function loadUsers() {
    [errorMsg, successMsg].forEach(m => (m.hidden = true));
    usersBody.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">در حال بارگذاری…</td></tr>';
    try {
      const j = await callService({ action: "listUsers" });
      renderUsers(j.users || []);
    } catch (err) {
      usersBody.innerHTML = "";
      showMsg(errorMsg, "بارگذاری فهرست ناموفق بود: " + String(err && err.message || ""));
    }
  }

  function permBadge(ok, yesText, noText) {
    return '<span class="perm ' + (ok ? "on" : "off") + '">' + (ok ? yesText : noText) + "</span>";
  }

  function renderUsers(users) {
    usersBody.innerHTML = users.map(u => {
      const isSelf = u.username === currentUser.username;
      return (
        "<tr>" +
        '<td dir="ltr" class="mono">' + escapeHtml(u.username) + "</td>" +
        "<td>" + escapeHtml(u.displayName || "—") + "</td>" +
        "<td>" + permBadge(u.isAdmin, "مدیر", "—") + "</td>" +
        "<td>" + permBadge(u.permView, "دارد", "ندارد") + "</td>" +
        "<td>" + permBadge(u.permUpload, "دارد", "ندارد") + "</td>" +
        "<td>" + permBadge(u.active, "فعال", "غیرفعال") + "</td>" +
        "<td>" +
        '<button class="btn small" data-edit="' + escapeHtml(u.username) + '">ویرایش</button> ' +
        (isSelf || u.username === "admin"
          ? ""
          : '<button class="btn small danger" data-del="' + escapeHtml(u.username) + '">حذف</button>') +
        "</td>" +
        "</tr>"
      );
    }).join("");

    usersBody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(b.dataset.edit, users))
    );
    usersBody.querySelectorAll("[data-del]").forEach(b =>
      b.addEventListener("click", () => deleteUser(b.dataset.del))
    );
  }

  // ---------- فرم کاربر ----------
  function openModal(username, users) {
    formError.hidden = true;
    form.reset();
    editingUser = username || null;

    if (editingUser) {
      const u = users.find(x => x.username === editingUser);
      if (!u) return;
      modalTitle.textContent = "ویرایش کاربر: " + editingUser;
      inUsername.value = u.username;
      inUsername.readOnly = true;
      inDisplay.value = u.displayName || "";
      ckAdmin.checked = u.isAdmin;
      ckView.checked = u.permView;
      ckUpload.checked = u.permUpload;
      ckActive.checked = u.active;
      passwordHint.textContent = "(برای تغییر رمز پر کنید، خالی = بدون تغییر)";
      inPassword.required = false;
    } else {
      modalTitle.textContent = "کاربر جدید";
      inUsername.readOnly = false;
      inUsername.required = true;
      passwordHint.textContent = "(الزامی، حداقل ۶ کاراکتر)";
      inPassword.required = true;
      ckView.checked = true;
      ckUpload.checked = false;
      ckAdmin.checked = false;
      ckActive.checked = true;
    }
    modal.hidden = false;
    inUsername.focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingUser = null;
  }

  document.getElementById("btn-new-user").addEventListener("click", () => openModal(null));
  document.getElementById("user-modal-close").addEventListener("click", closeModal);
  document.getElementById("btn-reload").addEventListener("click", loadUsers);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  ckAdmin.addEventListener("change", () => {
    if (ckAdmin.checked) { ckView.checked = true; ckUpload.checked = true; }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    formError.hidden = true;

    const payload = {
      action: "saveUser",
      user: {
        username: inUsername.value.trim(),
        displayName: inDisplay.value.trim(),
        password: inPassword.value,
        isAdmin: ckAdmin.checked,
        permView: ckView.checked,
        permUpload: ckUpload.checked,
        active: ckActive.checked
      }
    };

    try {
      const j = await callService(payload);
      closeModal();
      showMsg(successMsg,
        j.mode === "created"
          ? "✓ کاربر «" + payload.user.username + "» ایجاد شد."
          : "✓ کاربر «" + payload.user.username + "» به‌روزرسانی شد.");
      loadUsers();
    } catch (err) {
      formError.textContent = String(err && err.message || "ذخیره ناموفق بود.");
      formError.hidden = false;
    }
  });

  async function deleteUser(username) {
    if (!confirm("کاربر «" + username + "» حذف شود؟ این عمل بازگشت‌پذیر نیست.")) return;
    try {
      await callService({ action: "deleteUser", username: username });
      showMsg(successMsg, "✓ کاربر «" + username + "» حذف شد.");
      loadUsers();
    } catch (err) {
      showMsg(errorMsg, "حذف ناموفق بود: " + String(err && err.message || ""));
    }
  }

  loadUsers();
})();
