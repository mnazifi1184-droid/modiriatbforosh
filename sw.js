// Service Worker — کش کامل برای کارکرد آفلاین (اینترنت ملی)
const CACHE = "mbf-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./view.html",
  "./style.css",
  "./app.js",
  "./view.js",
  "./manifest.json",
  "./icon.svg",
  "./files/sample.xlsx",
  "./vendor/xlsx.full.min.js",
  "./fonts/Vazirmatn-Regular.ttf",
  "./fonts/Vazirmatn-Bold.ttf"
];

// نصب: همه‌ی فایل‌ها را از قبل کش کن
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// فعال‌سازی: کش‌های قدیمی را پاک کن
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// درخواست‌ها: اول کش، بعد شبکه (cache-first)
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // پاسخ معتبر را برای دفعات بعد ذخیره کن
        if (res && res.ok && new URL(e.request.url).origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // صفحه‌ی ناوبری آفلاین: اگر صفحه خواسته شده، از کش بده
        if (e.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
