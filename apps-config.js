/* ============================================================
 * فهرست برنامه‌ها و شاخه‌های آن‌ها — منبع واحد حقیقت
 * این ساختار باید با APPS در AppsScript.gs هماهنگ بماند.
 * برای تغییر نام برنامه‌ها یا شاخه‌ها فقط همین فایل (و نسخه‌ی
 * سرور) را ویرایش کنید؛ بقیه‌ی صفحات خودکار پیروی می‌کنند.
 * ============================================================ */
const APPS = [
  {
    id: "digikala",
    title: "دیجی کالا",
    icon: "🛒",
    color: "#e63757",
    sections: [
      { id: "stock-ikco",  title: "موجودی ایرانخودرو" },
      { id: "stock-saipa", title: "موجودی سایپا" },
      { id: "dk-reports",  title: "گزارش دیجی کالا" }
    ]
  },
  {
    id: "arpa",
    title: "ثبت فاکتور در آرپا",
    icon: "🧾",
    color: "#2563eb",
    sections: [
      { id: "new-invoice", title: "ثبت فاکتور جدید" },
      { id: "invoices",    title: "فهرست فاکتورها" },
      { id: "customers",   title: "مشتریان" },
      { id: "reports",     title: "گزارش‌ها" }
    ]
  },
  {
    id: "daghi",
    title: "جمع‌آوری داغی",
    icon: "🔥",
    color: "#ea580c",
    sections: [
      { id: "collect", title: "ثبت جمع‌آوری" },
      { id: "list",    title: "فهرست داغی" },
      { id: "returns", title: "مرجوعی‌ها" },
      { id: "reports", title: "گزارش‌ها" }
    ]
  }
];

/* ابزارهای سیستمی — به perms قدیمی (permView/permUpload/isAdmin) وصل‌اند */
const SYSTEM_TILES = [
  { id: "view",  title: "نمایش داده‌ها",    icon: "📊", color: "#0f766e", href: "view.html",   perm: "permView" },
  { id: "upload",title: "آپلود و انتشار اکسل", icon: "⬆️", color: "#7c3aed", href: "upload.html", perm: "permUpload" },
  { id: "admin", title: "مدیریت کاربران",   icon: "⚙️", color: "#334155", href: "admin.html",  perm: "isAdmin" }
];

/* ---------- ابزارهای کار با دسترسی ---------- */

// perms = { apps: { appId: { access: true, sections: { secId: true } } } }
function appAccess(perms, appId) {
  if (!perms || !perms.apps || !perms.apps[appId]) return false;
  return perms.apps[appId].access === true;
}
function sectionAccess(perms, appId, secId) {
  if (!appAccess(perms, appId)) return false;
  const s = perms.apps[appId].sections || {};
  return s[secId] === true;
}
function allowedApps(perms) {
  return APPS.filter(a => appAccess(perms, a.id));
}
function allowedSections(perms, appId) {
  const app = APPS.find(a => a.id === appId);
  if (!app) return [];
  return app.sections.filter(s => sectionAccess(perms, appId, s.id));
}
function userPerms(user) {
  if (!user) return { apps: {} };
  function allPerms() {
    const apps = {};
    APPS.forEach(a => {
      const sections = {};
      a.sections.forEach(s => { sections[s.id] = true; });
      apps[a.id] = { access: true, sections: sections };
    });
    return { apps: apps };
  }
  // مدیر به همه‌چیز دسترسی دارد
  if (user.isAdmin) return allPerms();
  // فیلد سرور: appsPerm — «all» یا شیء { apps: {...} }
  const p = user.appsPerm;
  if (p === "all") return allPerms();
  return (p && typeof p === "object" && p.apps) ? p : { apps: {} };
}
