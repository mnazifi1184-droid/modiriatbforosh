/**
 * ============================================================
 * AppsScript.gs — کد سمت گوگل‌شیت
 *
 * نصب:
 * ۱. گوگل‌شیت خودت را باز کن → Extensions (افزونه‌ها) → Apps Script
 * ۲. تمام محتوای این فایل را جایگزین محتوای Code.gs کن
 * ۳. Deploy (استقرار) → New deployment (استقرار جدید)
 *     - نوع: Web app (برنامه‌ی وب)
 *     - Execute as (اجرا به‌عنوان): Me (من)
 *     - Who has access (چه کسانی دسترسی دارند): Anyone (هر کسی)
 * ۴. آدرس /exec تولیدشده را کپی کن — همان «آدرس سرویس» است
 *    که در تنظیمات مدیرِ سایت وارد می‌کنی.
 * ============================================================
 */

/* تنظیمات شیت‌ها — همان نام‌هایی که در کد قبلی داشتی */
const CONFIG = {
  SHEET_NAME: 'Products',
  BARCOD_SHEET_NAME: 'Barcod',
  PAK_SHEET_NAME: 'Pak',
  OMR_SHEET_NAME: 'Omr',
  Endmonth_SHEET_NAME: 'Endmonth'
};

/* حداکثر ردیف در هر درخواست */
const MAX_ROWS = 100000;

/* ------------------------------------------------------------
 * نقطه‌ی ورود — درخواست‌های POST سایت به این‌جا می‌رسد
 * ------------------------------------------------------------ */
function doPost(e) {

  let payload;

  try {
    payload = JSON.parse(
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : '{}'
    );
  } catch (parseError) {
    return respond_({ success: false, error: 'بدنه‌ی درخواست JSON نیست.' });
  }

  try {

    switch (payload.action) {

      case 'ping':
        return respond_({
          success: true,
          sheets: getSheetNamesForUpload()
        });

      case 'import':
        return respond_(
          importRowsToSheet(payload)
        );

      default:
        return respond_({
          success: false,
          error: 'عملیات ناشناخته: ' + String(payload.action || '—')
        });

    }

  } catch (error) {
    return respond_({
      success: false,
      error: error && error.message ? error.message : 'خطای نامشخص'
    });
  }

}

/* پاسخ JSON به سایت */
function respond_(obj) {

  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

}

/* ------------------------------------------------------------
 * فهرست شیت‌های فایل فعلی
 * ------------------------------------------------------------ */
function getSheetNamesForUpload() {

  const sheets =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheets();

  return sheets.map(function (sheet) {
    return sheet.getName();
  });

}

/* ------------------------------------------------------------
 * درج ردیف‌ها در شیت مقصد
 *
 * payload:
 * {
 *   action:      'import',
 *   rows:        [[...], [...]],
 *   targetSheet: 'Products',
 *   mode:        'replace' | 'append',
 *   allowCreate: true | false
 * }
 * ------------------------------------------------------------ */
function importRowsToSheet(payload) {

  if (!payload || typeof payload !== 'object') {
    throw new Error('اطلاعات ارسال نشده است.');
  }

  const rows = payload.rows;

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('داده‌ای برای درج دریافت نشد.');
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(
      'تعداد ردیف‌ها بیش از حد مجاز است (حداکثر ۱۰۰٬۰۰۰ ردیف در هر شیت).'
    );
  }

  const targetSheetName =
    String(payload.targetSheet || '').trim();

  if (!targetSheetName) {
    throw new Error('شیت مقصد انتخاب نشده است.');
  }

  const mode =
    payload.mode === 'append' ? 'append' : 'replace';

  const allowCreate =
    payload.allowCreate === true;

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    spreadsheet.getSheetByName(targetSheetName);

  if (!sheet) {

    if (allowCreate) {
      sheet = spreadsheet.insertSheet(targetSheetName);
    } else {
      throw new Error('شیت «' + targetSheetName + '» پیدا نشد.');
    }

  }

  /* یکسان‌سازی تعداد ستون‌ها و تبدیل به رشته
     (معادل فرمت Text — صفر ابتدایی حفظ می‌شود) */

  let columnCount = 0;

  rows.forEach(function (row) {
    if (row && row.length > columnCount) {
      columnCount = row.length;
    }
  });

  if (columnCount < 1) columnCount = 1;

  const padded = rows.map(function (row) {

    const normalized = Array.isArray(row) ? row.slice() : [];

    for (let c = 0; c < normalized.length; c++) {
      normalized[c] =
        normalized[c] == null ? '' : String(normalized[c]);
    }

    while (normalized.length < columnCount) {
      normalized.push('');
    }

    return normalized;

  });

  /* نوشتن در شیت */

  let startRow = 1;

  if (mode === 'append') {
    startRow = sheet.getLastRow() + 1;
  } else {
    sheet.clearContents();
  }

  const neededRows = startRow + padded.length - 1;

  if (neededRows > sheet.getMaxRows()) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      neededRows - sheet.getMaxRows()
    );
  }

  if (columnCount > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columnCount - sheet.getMaxColumns()
    );
  }

  const targetRange =
    sheet.getRange(startRow, 1, padded.length, columnCount);

  /* فرمت متنی تا صفر ابتدایی بازتفسیر نشود */
  targetRange.setNumberFormat('@');
  targetRange.setValues(padded);

  SpreadsheetApp.flush();

  return {
    success: true,
    sheetName: targetSheetName,
    mode: mode,
    rows: padded.length,
    columns: columnCount
  };

}

/* ------------------------------------------------------------
 * تست دستی از داخل ویرایشگر Apps Script (اختیاری)
 * ------------------------------------------------------------ */
function testImportManually() {

  const result = importRowsToSheet({
    rows: [['کد', 'نام'], ['0001', 'تست']],
    targetSheet: CONFIG.SHEET_NAME,
    mode: 'replace',
    allowCreate: false
  });

  Logger.log(result);

}
