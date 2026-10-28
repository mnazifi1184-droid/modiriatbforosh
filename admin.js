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
  const appsPermList = document.getElementById("apps-perm-list");
  const appsPermGroup = document.getElementById("apps-perm-group");

  let serviceUrl = localStorage.getItem(SERVICE_KEY) || "";
  let editingUser = null; // null = ایجاد، رشته = ویرایش

  // ---------- UI دسترسی برنامه‌ها ----------
  function buildAppsPermUI(perms) {
    appsPermList.innerHTML = APPS.map(app => {
      const acc = appAccess(perms, app.id);
      const secs = app.sections.map(sec => {
        const on = sectionAccess(perms, app.id, sec.id);
        return (
          '<label class="check sub"><input type="checkbox" data-app="' + app.id + '" data-sec="' + sec.id + '"' +
          (on ? " checked" : "") + (acc ? "" : " disabled") + "> " + sec.title + "</label>"
        );
      }).join("");
      return (
        '<div class="app-perm" data-appblock="' + app.id + '">' +
        '<label class="check app-head"><input type="checkbox" data-appacc="' + app.id + '"' + (acc ? " checked" : "") + '> ' +
        '<span class="app-emoji">' + app.icon + "</span> <strong>" + app.title + "</strong></label>" +
        '<div class="app-secs"' + (acc ? "" : " hidden") + ">" + secs + "</div>" +
        "</div>"
      );
    }).join("");

    appsPermList.querySelectorAll("[data-appacc]").forEach(cb => {
      cb.addEventListener("change", () => {
        const block = appsPermList.querySelector('[data-appblock="' + cb.dataset.appacc + '"]');
        block.querySelector(".app-secs").hidden = !cb.checked;
        if (cb.checked) {
          block.querySelectorAll("[data-sec]").forEach(s => { s.checked = true; s.disabled = false; });
        }
      });
    });
  }

  function readAppsPermFromUI() {
    const apps = {};
    APPS.forEach(app => {
      const accCb = appsPermList.querySelector('[data-appacc="' + app.id + '"]');
      if (!accCb || !accCb.checked) return;
      const sections = {};
      app.sections.forEach(sec => {
        const sCb = appsPermList.querySelector('[data-app="' + app.id + '"][data-sec="' + sec.id + '"]');
        if (sCb && sCb.checked) sections[sec.id] = true;
      });
      apps[app.id] = { access: true, sections: sections };
    });
    return { apps: apps };
  }

  function syncAppsGroupVisibility() {
    appsPermGroup.hidden = ckAdmin.checked;
  }

  function appsSummary(u) {
    if (u.isAdmin || u.appsPerm === "all") return '<span class="perm on">همه</span>';
    const perms = u.appsPerm && u.appsPerm.apps ? u.appsPerm : { apps: {} };
    const on = APPS.filter(a => appAccess(perms, a.id));
    if (!on.length) return '<span class="perm off">هیچ</span>';
    return on.map(a => '<span class="perm on">' + a.icon + " " + a.title + "</span>").join(" ");
  }

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
  if (currentUser.isAdmin || currentUser.permView) {
    const nv = document.getElementById("nav-view"); if (nv) nv.hidden = false;
  }
  if (currentUser.isAdmin || currentUser.permUpload) {
    const nu = document.getElementById("nav-upload"); if (nu) nu.hidden = false;
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
    usersBody.innerHTML = '<tr><td colspan="8" style="color:var(--muted)">در حال بارگذاری…</td></tr>';
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
        "<td class='apps-cell'>" + appsSummary(u) + "</td>" +
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
      buildAppsPermUI(u.appsPerm === "all" ? userPerms({ isAdmin: true }) : (u.appsPerm || { apps: {} }));
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
      buildAppsPermUI({ apps: {} });
    }
    syncAppsGroupVisibility();
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
    syncAppsGroupVisibility();
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
        active: ckActive.checked,
        appsPerm: ckAdmin.checked ? "all" : readAppsPermFromUI()
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
