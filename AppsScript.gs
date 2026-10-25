/**
 * ============================================================
 * AppsScript.gs — کد سمت گوگل‌شیت (نسخه‌ی ۲: با لاگین و مدیریت کاربران)
 *
 * نصب / به‌روزرسانی:
 * ۱. Extensions → Apps Script → کل کد را جایگزین کنید
 * ۲. Deploy → Manage deployments → آیکون مداد (Edit) → Version: New version → Deploy
 *    (آدرس /exec همان قبلی می‌ماند و نیازی به تغییر در سایت نیست)
 *
 * اولین ورود به سایت:
 *   نام کاربری: admin    رمز: 12345678
 *   ⚠ بعد از اولین ورود، از صفحه‌ی مدیریت، رمز admin را عوض کنید.
 * ============================================================
 */

/* نام شیت‌های داده */
const CONFIG = {
  SHEET_NAME: 'Products',
  BARCOD_SHEET_NAME: 'Barcod',
  PAK_SHEET_NAME: 'Pak',
  OMR_SHEET_NAME: 'Omr',
  Endmonth_SHEET_NAME: 'Endmonth'
};

const USERS_SHEET = 'Users';
const SESSION_HOURS = 6;
const MAX_ROWS = 100000;

/* ------------------------------------------------------------
 * نقطه‌ی ورود
 * ------------------------------------------------------------ */
function doPost(e) {

  let payload;
  try {
    payload = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );
  } catch (parseError) {
    return respond_({ success: false, error: 'بدنه‌ی درخواست JSON نیست.' });
  }

  try {
    switch (payload.action) {

      case 'ping':
        return respond_({ success: true, sheets: getSheetNamesForUpload() });

      case 'login':
        return respond_(login(payload));

      case 'listUsers':
        return respond_(adminGuard_(payload, listUsers_));

      case 'saveUser':
        return respond_(adminGuard_(payload, saveUser));

      case 'deleteUser':
        return respond_(adminGuard_(payload, deleteUser));

      case 'changePassword':
        return respond_(changePassword(payload));

      case 'import': {
        const sess = getSession_(payload.sessionKey);
        if (!sess || !(sess.isAdmin || sess.permUpload)) {
          return respond_({ success: false, error: 'دسترسی درج داده ندارید — دوباره وارد شوید.' });
        }
        return respond_(importRowsToSheet(payload));
      }

      default:
        return respond_({ success: false, error: 'عملیات ناشناخته: ' + String(payload.action || '—') });
    }

  } catch (error) {
    return respond_({
      success: false,
      error: error && error.message ? error.message : 'خطای نامشخص'
    });
  }

}

function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 * رمزگذاری
 * ============================================================ */
function hashPassword_(pw) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pw),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');
}

/* ============================================================
 * شیت کاربران
 * ستون‌ها: username | passwordHash | displayName | isAdmin |
 *          permView | permUpload | active
 * ============================================================ */
function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET);
    sheet.appendRow(['username', 'passwordHash', 'displayName', 'isAdmin', 'permView', 'permUpload', 'active']);
    sheet.setFrozenRows(1);
  }
  /* اولین کاربر: admin پیش‌فرض */
  if (sheet.getLastRow() < 2) {
    sheet.appendRow(['admin', hashPassword_('12345678'), 'مدیر سیستم', 'yes', 'yes', 'yes', 'yes']);
  }
  return sheet;
}

function listUsers_() {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  const users = [];
  for (let r = 1; r < values.length; r++) {
    users.push({
      username: String(values[r][0]),
      displayName: String(values[r][2]),
      isAdmin: String(values[r][3]) === 'yes',
      permView: String(values[r][4]) === 'yes',
      permUpload: String(values[r][5]) === 'yes',
      active: String(values[r][6]) === 'yes'
    });
  }
  return { success: true, users: users };
}

function findUser_(username) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(username)) {
      return { row: r + 1, hash: String(values[r][1]), active: String(values[r][6]) === 'yes' };
    }
  }
  return null;
}

/* ============================================================
 * نشست‌ها (Session) — با CacheService، اعتبار ۶ ساعت
 * ============================================================ */
function getSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  return raw ? JSON.parse(raw) : null;
}

/* ============================================================
 * ورود
 * ============================================================ */
function login(payload) {
  const username = String((payload && payload.username) || '').trim();
  const password = String((payload && payload.password) || '');

  if (!username || !password) {
    return { success: false, error: 'نام کاربری و رمز را وارد کنید.' };
  }

  const found = findUser_(username);
  if (!found || found.hash !== hashPassword_(password)) {
    return { success: false, error: 'نام کاربری یا رمز اشتباه است.' };
  }
  if (!found.active) {
    return { success: false, error: 'حساب کاربری شما غیرفعال شده است.' };
  }

  const sheet = getUsersSheet_();
  const row = sheet.getRange(found.row, 1, 1, 7).getValues()[0];

  const user = {
    username: String(row[0]),
    displayName: String(row[2]),
    isAdmin: String(row[3]) === 'yes',
    permView: String(row[4]) === 'yes',
    permUpload: String(row[5]) === 'yes'
  };

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify(user),
    SESSION_HOURS * 60 * 60
  );

  return { success: true, token: token, user: user, expiresInHours: SESSION_HOURS };
}

/* ============================================================
 * نگهبان مدیریت — فقط isAdmin
 * ============================================================ */
function adminGuard_(payload, fn) {
  const sess = getSession_(payload && payload.sessionKey);
  if (!sess || !sess.isAdmin) {
    return { success: false, error: 'فقط مدیر به این بخش دسترسی دارد.' };
  }
  return fn(payload);
}

/* ============================================================
 * ذخیره‌ی کاربر (ایجاد یا ویرایش)
 * ============================================================ */
function saveUser(payload) {
  const u = payload.user || {};
  const username = String(u.username || '').trim();
  if (!username) throw new Error('نام کاربری خالی است.');
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    throw new Error('نام کاربری فقط حروف انگلیسی، عدد، نقطه، زیرخط و خط تیره (۳ تا ۳۲ کاراکتر).');
  }

  const sheet = getUsersSheet_();
  const found = findUser_(username);

  if (found) {
    /* ویرایش */
    sheet.getRange(found.row, 3).setValue(String(u.displayName || ''));
    sheet.getRange(found.row, 4).setValue(u.isAdmin ? 'yes' : 'no');
    sheet.getRange(found.row, 5).setValue(u.permView ? 'yes' : 'no');
    sheet.getRange(found.row, 6).setValue(u.permUpload ? 'yes' : 'no');
    sheet.getRange(found.row, 7).setValue(u.active === false ? 'no' : 'yes');
    if (u.password) {
      if (String(u.password).length < 6) throw new Error('رمز باید حداقل ۶ کاراکتر باشد.');
      sheet.getRange(found.row, 2).setValue(hashPassword_(u.password));
    }
    return { success: true, mode: 'updated', username: username };
  }

  /* ایجاد جدید */
  if (!u.password) throw new Error('برای کاربر جدید، رمز الزامی است.');
  if (String(u.password).length < 6) throw new Error('رمز باید حداقل ۶ کاراکتر باشد.');
  sheet.appendRow([
    username,
    hashPassword_(u.password),
    String(u.displayName || ''),
    u.isAdmin ? 'yes' : 'no',
    u.permView ? 'yes' : 'no',
    u.permUpload ? 'yes' : 'no',
    u.active === false ? 'no' : 'yes'
  ]);
  return { success: true, mode: 'created', username: username };
}

/* ============================================================
 * حذف کاربر
 * ============================================================ */
function deleteUser(payload) {
  const username = String((payload && payload.username) || '').trim();
  if (!username) throw new Error('نام کاربری مشخص نشده است.');
  if (username === 'admin') throw new Error('کاربر admin قابل حذف نیست.');

  const sheet = getUsersSheet_();
  const found = findUser_(username);
  if (!found) throw new Error('کاربر پیدا نشد.');
  sheet.deleteRow(found.row);
  return { success: true, username: username };
}

/* ============================================================
 * تغییر رمز توسط خود کاربر
 * ============================================================ */
function changePassword(payload) {
  const sess = getSession_(payload.sessionKey);
  if (!sess) return { success: false, error: 'نشست منقضی شده — دوباره وارد شوید.' };

  const found = findUser_(sess.username);
  if (!found) return { success: false, error: 'کاربر پیدا نشد.' };
  if (found.hash !== hashPassword_(payload.oldPassword)) {
    return { success: false, error: 'رمز فعلی اشتباه است.' };
  }
  if (!payload.newPassword || String(payload.newPassword).length < 6) {
    return { success: false, error: 'رمز جدید باید حداقل ۶ کاراکتر باشد.' };
  }

  getUsersSheet_().getRange(found.row, 2).setValue(hashPassword_(payload.newPassword));
  return { success: true };
}

/* ============================================================
 * فهرست شیت‌ها و درج داده (بخش آپلود)
 * ============================================================ */
function getSheetNamesForUpload() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
    return s.getName();
  });
}

function importRowsToSheet(payload) {
  const rows = payload.rows;
  if (!Array.isArray(rows) || !rows.length) throw new Error('داده‌ای برای درج دریافت نشده است.');
  if (rows.length > MAX_ROWS) throw new Error('تعداد ردیف‌ها بیش از حد مجاز است (حداکثر ۱۰۰٬۰۰۰).');

  const targetSheetName = String(payload.targetSheet || '').trim();
  if (!targetSheetName) throw new Error('شیت مقصد انتخاب نشده است.');

  const mode = payload.mode === 'append' ? 'append' : 'replace';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(targetSheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(targetSheetName);

  let columnCount = 0;
  rows.forEach(function (row) {
    if (row && row.length > columnCount) columnCount = row.length;
  });
  if (columnCount < 1) columnCount = 1;

  const padded = rows.map(function (row) {
    const normalized = Array.isArray(row) ? row.slice() : [];
    for (let c = 0; c < normalized.length; c++) {
      normalized[c] = normalized[c] == null ? '' : String(normalized[c]);
    }
    while (normalized.length < columnCount) normalized.push('');
    return normalized;
  });

  let startRow = mode === 'append' ? sheet.getLastRow() + 1 : (sheet.clearContents(), 1);

  const neededRows = startRow + padded.length - 1;
  if (neededRows > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }
  if (columnCount > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }

  const targetRange = sheet.getRange(startRow, 1, padded.length, columnCount);
  targetRange.setNumberFormat('@');
  targetRange.setValues(padded);
  SpreadsheetApp.flush();

  return { success: true, sheetName: targetSheetName, mode: mode, rows: padded.length, columns: columnCount };
}
