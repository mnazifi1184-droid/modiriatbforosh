// منطق صفحه‌ی لاگین
(function () {
  const SERVICE_KEY = "mbf_script_url";
  const USER_KEY = "mbf_user";
  const SESSION_KEY = "mbf_session";

  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const errorMsg = document.getElementById("login-error");
  const successMsg = document.getElementById("login-success");
  const btn = document.getElementById("login-btn");

  // اگر از قبل نشست فعال دارد، مستقیم برود صفحه‌ی اصلی
  try {
    const saved = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    if (saved && localStorage.getItem(SESSION_KEY)) {
      location.href = homeFor(saved);
      return;
    }
  } catch {}

  // مقصد بعد از ورود بر اساس دسترسی
  function homeFor(user) {
    if (user.isAdmin || user.permUpload) return "dashboard.html";
    return "view.html";
  }

  // آدرس سرویس: تنظیم مدیر > پیش‌فرض config.js — یا از query string (?service=…)
  let serviceUrl = (window.mbfServiceUrl ? window.mbfServiceUrl() : localStorage.getItem(SERVICE_KEY)) || "";
  const qs = new URLSearchParams(location.search);
  if (qs.get("service")) {
    serviceUrl = qs.get("service");
    localStorage.setItem(SERVICE_KEY, serviceUrl);
  }

  async function callService(payload) {
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("http " + res.status);
    const j = await res.json();
    if (!j.success) throw new Error(j.error || "خطای نامشخص سرویس");
    return j;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!serviceUrl) {
      errorMsg.textContent = "آدرس سرویس تنظیم نشده — از صفحه‌ی آپلود، تنظیمات مدیر را تکمیل کنید.";
      errorMsg.hidden = false;
      return;
    }
    errorMsg.hidden = true;
    successMsg.hidden = true;
    btn.disabled = true;
    btn.textContent = "در حال ورود…";

    try {
      const j = await callService({
        action: "login",
        username: usernameInput.value.trim(),
        password: passwordInput.value
      });
      localStorage.setItem(SESSION_KEY, j.token);
      localStorage.setItem(USER_KEY, JSON.stringify(j.user));
      successMsg.textContent = "✓ خوش آمدید " + (j.user.displayName || j.user.username);
      successMsg.hidden = false;
      setTimeout(() => { location.href = homeFor(j.user); }, 400);
    } catch (err) {
      errorMsg.textContent = String(err && err.message || "ورود ناموفق بود — اتصال به گوگل را بررسی کنید.");
      errorMsg.hidden = false;
      btn.disabled = false;
      btn.textContent = "ورود";
    }
  });
})();
