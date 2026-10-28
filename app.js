// صفحه‌ی برنامه — شاخه‌ها بر اساس دسترسی کاربر
(function () {
  const USER_KEY = "mbf_user";
  const SESSION_KEY = "mbf_session";

  // ---------- نگهبانی ----------
  const sessionKey = localStorage.getItem(SESSION_KEY);
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch {}
  if (!sessionKey || !currentUser) { location.href = "login.html"; return; }

  const params = new URLSearchParams(location.search);
  const appId = params.get("app");
  const app = APPS.find(a => a.id === appId);

  if (!app) {
    location.href = "dashboard.html";
    return;
  }

  const perms = userPerms(currentUser);
  if (!appAccess(perms, app.id)) {
    // دسترسی ندارد — پیام به‌جای ریدایرکت تا کاربر بداند چرا
    document.getElementById("app-hero").hidden = true;
    document.getElementById("no-access").hidden = false;
    document.getElementById("footer-text").textContent = "مدیریت فروش — " + app.title;
    document.title = app.title + " — مدیریت فروش";
    document.getElementById("btn-logout").addEventListener("click", () => {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(USER_KEY);
      location.href = "login.html";
    });
    return;
  }

  const allowed = allowedSections(perms, app.id);

  // ---------- هدر برنامه ----------
  document.title = app.title + " — مدیریت فروش";
  document.getElementById("app-icon").textContent = app.icon;
  document.getElementById("app-title").textContent = app.title;
  document.getElementById("footer-text").textContent = "مدیریت فروش — " + app.title;

  // ---------- ناوبری ----------
  if (currentUser.permView || currentUser.isAdmin) document.getElementById("nav-view").hidden = false;
  if (currentUser.permUpload || currentUser.isAdmin) document.getElementById("nav-upload").hidden = false;
  if (currentUser.isAdmin) document.getElementById("nav-admin").hidden = false;
  document.getElementById("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = "login.html";
  });

  // ---------- کاشی شاخه‌ها ----------
  document.getElementById("section-tiles").innerHTML = allowed
    .map(sec =>
      '<a class="tile sec" href="#" data-sec="' + sec.id + '" style="--tile-color:' + app.color + '">' +
      '<span class="tile-icon">📁</span>' +
      '<span class="tile-title">' + sec.title + "</span>" +
      "</a>"
    ).join("");

  // برنامه‌هایی که صفحه‌ی اختصاصی دارند — شاخه‌ها مستقیم به صفحه‌ی برنامه لینک می‌شوند
  const READY_APPS = ["digikala"];
  document.querySelectorAll("#section-tiles .tile").forEach(el => {
    if (READY_APPS.indexOf(app.id) !== -1) {
      el.setAttribute("href", app.id + ".html");
      return;
    }
    el.addEventListener("click", e => {
      e.preventDefault();
      const secId = el.dataset.sec;
      const sec = app.sections.find(s => s.id === secId);
      const err = document.getElementById("app-error");
      err.textContent = "بخش «" + (sec ? sec.title : secId) + "» به‌زودی در دسترس قرار می‌گیرد — ساخت صفحه‌ی این شاخه مرحله‌ی بعد است.";
      err.className = "msg success";
      err.hidden = false;
    });
  });

  // اگر هیچ شاخه‌ای مجاز نیست
  if (!allowed.length) {
    document.getElementById("section-tiles").innerHTML = "";
    document.getElementById("no-access").hidden = false;
    document.getElementById("app-hero").hidden = true;
  }
})();
