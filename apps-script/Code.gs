// Apps Script for the Google Sheet «Full body — журнал».
// Receives the whole log from the workout app and rewrites the tab «Приложение».
// Deploy: Extensions → Apps Script → paste → Deploy → New deployment → Web app,
// Execute as: Me, Who has access: Anyone. Paste the /exec URL into the app («Данные»).

const TAB = 'Приложение';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data || data.app !== 'workout-app' || typeof data.csv !== 'string') throw new Error('bad request');
    const rows = Utilities.parseCsv(data.csv).filter(function (r) { return r.join('') !== ''; });
    if (!rows.length || rows[0][0] !== 'date') throw new Error('bad csv');
    const body = rows.slice(1).map(function (r) { return [r[0], r[1], r[2], Number(r[3]), Number(r[4])]; });
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
      sh.clearContents();
      sh.getRange(1, 1, 1, 5).setValues([rows[0]]);
      if (body.length) {
        sh.getRange(2, 1, body.length, 1).setNumberFormat('@');
        sh.getRange(2, 1, body.length, 5).setValues(body);
      }
      sh.getRange(1, 7).setValue('Обновлено: ' + Utilities.formatDate(new Date(), 'Europe/Prague', 'yyyy-MM-dd HH:mm'));
    } finally { lock.releaseLock(); }
    return out({ ok: true, count: body.length });
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  }
}

function doGet() { return out({ ok: true, ping: true }); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
