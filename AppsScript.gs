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

      case 'upsertDataRows':
        return respond_(upsertDataRows(payload));

      case 'readDataRows':
        return respond_(readDataRows(payload));

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
 * دسترسی برنامه‌محور
 * ============================================================ */
function normalizeAppsPerm_(appsPerm) {
  if (appsPerm === 'all') return 'yes';
  if (!appsPerm || typeof appsPerm !== 'object') return '';
  try {
    return JSON.stringify(appsPerm);
  } catch (e) {
    return '';
  }
}

function parseAppsPerm_(raw) {
  const s = String(raw || '').trim();
  if (!s) return { apps: {} };
  if (s === 'yes' || s === 'all') return 'all';
  try {
    const o = JSON.parse(s);
    return (o && typeof o === 'object' && o.apps) ? o : { apps: {} };
  } catch (e) {
    return { apps: {} };
  }
}

/* ============================================================
 * شیت کاربران
 * ستون‌ها: username | passwordHash | displayName | isAdmin |
 *          permView | permUpload | appsPermJson | active
 * appsPermJson: دسترسی برنامه‌محور —
 *   {"apps":{"digikala":{"access":true,"sections":{"orders":true,...}},...}}
 * ============================================================ */

/* فهرست برنامه‌ها و شاخه‌ها — باید با apps-config.js سمت سایت هماهنگ بماند */
var APPS = [
  { id: 'digikala', title: 'دیجی کالا',
    sections: [
      { id: 'stock-ikco',  title: 'موجودی ایرانخودرو' },
      { id: 'stock-saipa', title: 'موجودی سایپا' },
      { id: 'dk-reports',  title: 'گزارش دیجی کالا' }
    ]
  },
  { id: 'arpa', title: 'ثبت فاکتور در آرپا',
    sections: [
      { id: 'new-invoice', title: 'ثبت فاکتور جدید' },
      { id: 'invoices',    title: 'فهرست فاکتورها' },
      { id: 'customers',   title: 'مشتریان' },
      { id: 'reports',     title: 'گزارش‌ها' }
    ]
  },
  { id: 'daghi', title: 'جمع‌آوری داغی',
    sections: [
      { id: 'collect', title: 'ثبت جمع‌آوری' },
      { id: 'list',    title: 'فهرست داغی' },
      { id: 'returns', title: 'مرجوعی‌ها' },
      { id: 'reports', title: 'گزارش‌ها' }
    ]
  }
];
function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET);
    sheet.appendRow(['username', 'passwordHash', 'displayName', 'isAdmin', 'permView', 'permUpload', 'appsPermJson', 'active']);
    sheet.setFrozenRows(1);
  }

  /* ارتقای خودکار شیت‌های قدیمی ۷ ستونی:
     اگر ستون appsPermJson وجود ندارد ولی active هست، یک ستون قبل از active
     اضافه می‌شود تا active به جای درست (ستون ۸) برود و داده‌ها دست نخورده بمانند */
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  if (hdr.indexOf('appsPermJson') === -1 && hdr.indexOf('active') !== -1) {
    const activeCol = hdr.indexOf('active') + 1;
    sheet.insertColumns(activeCol);
    sheet.getRange(1, activeCol).setValue('appsPermJson');
  }

  /* اولین کاربر: admin پیش‌فرض (هر ۸ ستون) */
  if (sheet.getLastRow() < 2) {
    sheet.appendRow(['admin', hashPassword_('12345678'), 'مدیر سیستم', 'yes', 'yes', 'yes', 'yes', 'yes']);
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
      active: String(values[r][7]) === 'yes',
      appsPerm: parseAppsPerm_(values[r][6])
    });
  }
  return { success: true, users: users, apps: APPS };
}

function findUser_(username) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(username)) {
      return { row: r + 1, hash: String(values[r][1]), active: String(values[r][7]) === 'yes' };
    }
  }
  return null;
}

/* ============================================================
 * دیتابیس جداگانه‌ی هر برنامه — یک فایل گوگل‌شیت مستقل در Drive
 * نام فایل‌ها: MBF_DB_digikala / MBF_DB_arpa / MBF_DB_daghi
 * دفعه‌ی اول که داده‌ای ذخیره شود، خودکار ساخته می‌شود.
 * ============================================================ */
function getAppDb_(appId) {
  const name = 'MBF_DB_' + String(appId).replace(/[^\w-]/g, '');
  if (!name || name === 'MBF_DB_') throw new Error('برنامه نامعتبر است.');

  // شناسه‌ی فایل دیتابیس در ScriptProperties نگه داشته می‌شود — بدون نیاز به مجوز Drive
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();

  const cachedId = cache.get('appdb_' + appId) || props.getProperty('appdb_' + appId);
  if (cachedId) {
    try {
      const ss = SpreadsheetApp.openById(cachedId);
      cache.put('appdb_' + appId, ss.getId(), 21600);
      return ss;
    } catch (e) { /* فایل حذف شده — دوباره می‌سازیم */ }
  }

  const ss = SpreadsheetApp.create(name);
  props.setProperty('appdb_' + appId, ss.getId());
  cache.put('appdb_' + appId, ss.getId(), 21600);
  const info = ss.getSheets()[0];
  info.setName('info');
  info.getRange('A1:B3').setValues([
    ['app', appId],
    ['created', new Date().toISOString()],
    ['note', 'دیتابیس اختصاصی این برنامه — خودکار ساخته شده']
  ]);
  return ss;
}

function hasAppAccess_(sess, appId) {
  if (!sess) return false;
  if (sess.isAdmin) return true;
  const p = sess.appsPerm;
  if (p === 'all') return true;
  if (p && typeof p === 'object' && p.apps && p.apps[appId]) {
    return p.apps[appId].access === true;
  }
  return false;
}

/* ------------------------------------------------------------
 * خواندن داده‌ی دیتاست برنامه (آخرین ۵۰۰ ردیف)
 * ------------------------------------------------------------ */
function readDataRows(payload) {
  const sess = getSession_(payload && payload.sessionKey);
  if (!sess) return { success: false, error: 'نشست منقضی شده — دوباره وارد شوید.' };

  const appId = String((payload && payload.appId) || '');
  if (!hasAppAccess_(sess, appId)) return { success: false, error: 'دسترسی به این برنامه را ندارید.' };

  const dataset = String((payload && payload.dataset) || '').replace(/[^\w-]/g, '');
  if (!dataset) return { success: false, error: 'نام دیتاست نامعتبر است.' };

  const ss = getAppDb_(appId);
  const sheet = ss.getSheetByName(dataset);
  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, columns: [], rows: [], total: 0, database: ss.getName() };
  }
  const lastCol = sheet.getLastColumn();
  const columns = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const all = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  return { success: true, columns: columns, rows: all.slice(-500), total: all.length, database: ss.getName() };
}

/* ------------------------------------------------------------
 * ذخیره‌ی داده در دیتابیس برنامه (درج/به‌روزرسانی با کلید)
 * payload: { sessionKey, appId, dataset, columns[], keyColumn, rows[][] }
 * اگر مقدار ستون کلید از قبل باشد، ردیف به‌روز می‌شود؛ وگرنه اضافه.
 * ------------------------------------------------------------ */
const UPSERT_STAMP_COL = '__updated_at';
function upsertDataRows(payload) {
  const sess = getSession_(payload && payload.sessionKey);
  if (!sess) return { success: false, error: 'نشست منقضی شده — دوباره وارد شوید.' };

  const appId = String((payload && payload.appId) || '');
  if (!hasAppAccess_(sess, appId)) {
    return { success: false, error: 'دسترسی به این برنامه را ندارید.' };
  }

  const dataset = String((payload && payload.dataset) || '').replace(/[^\w-]/g, '');
  if (!dataset) return { success: false, error: 'نام دیتاست نامعتبر است.' };

  const columns = ((payload && payload.columns) || []).map(String);
  const rows = (payload && payload.rows) || [];
  const keyColumn = String((payload && payload.keyColumn) || '');

  if (!columns.length) return { success: false, error: 'فهرست ستون‌ها خالی است.' };
  if (!rows.length) return { success: false, error: 'داده‌ای برای ذخیره نیست.' };
  if (!keyColumn || columns.indexOf(keyColumn) === -1) {
    return { success: false, error: 'ستون کلید انتخاب نشده یا معتبر نیست.' };
  }

  const ss = getAppDb_(appId);
  let sheet = ss.getSheetByName(dataset);
  if (!sheet) {
    sheet = ss.insertSheet(dataset);
    sheet.appendRow(columns.concat([UPSERT_STAMP_COL]));
    sheet.setFrozenRows(1);
  }

  /* همگام‌سازی هدرها — ستون‌های تازه به انتها اضافه می‌شوند */
  let hdr = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
    : [];
  columns.forEach(function (col) {
    if (hdr.indexOf(col) === -1) { hdr.push(col); sheet.getRange(1, hdr.length).setValue(col); }
  });
  if (hdr.indexOf(UPSERT_STAMP_COL) === -1) {
    hdr.push(UPSERT_STAMP_COL);
    sheet.getRange(1, hdr.length).setValue(UPSERT_STAMP_COL);
  }

  const keyIdx = hdr.indexOf(keyColumn);
  const stampIdx = hdr.indexOf(UPSERT_STAMP_COL);
  const now = Utilities.formatDate(new Date(), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss');

  const lastRow = sheet.getLastRow();
  const existing = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, hdr.length).getValues()
    : [];

  const index = {};
  existing.forEach(function (r, i) {
    const k = String(r[keyIdx]);
    if (k !== '') index[k] = i;
  });

  let inserted = 0, updated = 0, skipped = 0;
  rows.forEach(function (row) {
    const obj = {};
    columns.forEach(function (col, i) { obj[col] = row[i] !== undefined ? row[i] : ''; });
    const k = String(obj[keyColumn]);
    if (k === '') { skipped++; return; }
    const out = hdr.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
    out[stampIdx] = now;
    const at = index[k];
    if (at !== undefined) { existing[at] = out; updated++; }
    else { index[k] = existing.length; existing.push(out); inserted++; }
  });

  if (existing.length) {
    sheet.getRange(2, 1, existing.length, hdr.length).setValues(existing);
  }

  return {
    success: true,
    inserted: inserted,
    updated: updated,
    skipped: skipped,
    total: existing.length,
    database: ss.getName()
  };
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
  const row = sheet.getRange(found.row, 1, 1, 8).getValues()[0];

  const user = {
    username: String(row[0]),
    displayName: String(row[2]),
    isAdmin: String(row[3]) === 'yes',
    permView: String(row[4]) === 'yes',
    permUpload: String(row[5]) === 'yes',
    appsPerm: String(row[3]) === 'yes' ? 'all' : parseAppsPerm_(row[6])
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
    sheet.getRange(found.row, 7).setValue(u.isAdmin ? 'yes' : normalizeAppsPerm_(u.appsPerm));
    sheet.getRange(found.row, 8).setValue(u.active === false ? 'no' : 'yes');
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
    u.isAdmin ? 'yes' : normalizeAppsPerm_(u.appsPerm),
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
