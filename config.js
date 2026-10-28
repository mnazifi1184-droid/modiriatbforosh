// پیکربندی مشترک — این فایل را همه‌ی صفحه‌ها قبل از اسکریپت خودشان لود می‌کنند
// آدرس سرویس گوگل‌شیت (Apps Script Web App) — اگر خواستید تغییرش دهید فقط همین خط را عوض کنید
window.MBF_DEFAULT_SERVICE_URL = "https://script.google.com/macros/s/AKfycby5vFB7F-g-sqo17KvI3OzKtGn1fhy02U63bpAmwPZrS4r8GEVAZLiLiiLCNSgWZ6_z/exec";

// خواندن آدرس سرویس: اول تنظیم ذخیره‌شده‌ی مدیر در مرورگر، وگرنه پیش‌فرض بالا
window.mbfServiceUrl = function () {
  try {
    return localStorage.getItem("mbf_script_url") || window.MBF_DEFAULT_SERVICE_URL || "";
  } catch (e) {
    return window.MBF_DEFAULT_SERVICE_URL || "";
  }
};
