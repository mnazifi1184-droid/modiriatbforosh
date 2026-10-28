// داشبورد — کاشی‌های برنامه‌ها بر اساس دسترسی کاربر
(function () {
  const USER_KEY = "mbf_user";
  const SESSION_KEY = "mbf_session";

  // ---------- نگهبانی ----------
  const sessionKey = localStorage.getItem(SESSION_KEY);
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch {}
  if (!sessionKey || !currentUser) { location.href = "login.html"; return; }

  const perms = userPerms(currentUser);
  const hasApps = APPS.some(a => appAccess(perms, a.id));
  const hasSystem = (currentUser.isAdmin || currentUser.permView || currentUser.permUpload);

  // اگر هیچ دسترسی‌ای ندارد → خروج به لاگین
  if (!hasApps && !hasSystem) { location.href = "login.html"; return; }

  // ---------- خوش‌آمد ----------
  document.getElementById("welcome-title").textContent =
    "خوش آمدید، " + (currentUser.displayName || currentUser.username);

  // ---------- ناوبری ----------
  if (currentUser.permView || currentUser.isAdmin) document.getElementById("nav-view").hidden = false;
  if (currentUser.permUpload || currentUser.isAdmin) document.getElementById("nav-upload").hidden = false;
  if (currentUser.isAdmin) document.getElementById("nav-admin").hidden = false;

  document.getElementById("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = "login.html";
  });

  // ---------- کاشی‌ها ----------
  function tile(app) {
    return (
      '<a class="tile" href="app.html?app=' + app.id + '" style="--tile-color:' + app.color + '">' +
      '<span class="tile-icon">' + app.icon + "</span>" +
      '<span class="tile-title">' + app.title + "</span>" +
      '<span class="tile-sub">' + app.sections.length + " شاخه</span>" +
      "</a>"
    );
  }

  function systemTile(t) {
    const allowed = currentUser.isAdmin || currentUser[t.perm];
    if (!allowed) return "";
    return (
      '<a class="tile sys" href="' + t.href + '" style="--tile-color:' + t.color + '">' +
      '<span class="tile-icon">' + t.icon + "</span>" +
      '<span class="tile-title">' + t.title + "</span>" +
      "</a>"
    );
  }

  document.getElementById("apps-tiles").innerHTML = APPS.filter(a => appAccess(perms, a.id)).map(tile).join("");
  document.getElementById("system-tiles").innerHTML = SYSTEM_TILES.map(systemTile).join("");

  // اگر هیچ کاشی سیستمی ندارد، آن بخش را پنهان کن
  const sysWrap = document.getElementById("system-tiles");
  if (!sysWrap.innerHTML.trim()) {
    sysWrap.previousElementSibling.hidden = true;
    sysWrap.hidden = true;
  }
})();
