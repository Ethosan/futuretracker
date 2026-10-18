// Trade Journal: Google Apps Script backend.
// Paste into Extensions > Apps Script in your Google Sheet, then deploy as a
// Web app (Execute as: Me, Who has access: Anyone). See the README.

function doGet(e) {
  // Only a plain function name, so the reply can't carry other code.
  var cb = /^[A-Za-z_$][\w$]*$/.test(e.parameter.callback || '') ? e.parameter.callback : 'callback';
  var payload = e.parameter.payload;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // find or create the Trades sheet
  var sheet = ss.getSheetByName('Trades');
  if (!sheet) {
    var s = ss.getSheets()[0];
    s.setName('Trades');
    sheet = s;
  }

  if (payload) {
    var data = JSON.parse(decodeURIComponent(payload));

    if (data.action === 'setup') {
      sheet.clearContents();
      sheet.appendRow(data.headers);
      var r = sheet.getRange(1, 1, 1, data.headers.length);
      r.setBackground('#2a2a2a');
      r.setFontColor('#c8f56a');
      r.setFontWeight('bold');
      r.setFontFamily('DM Mono');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 180);
      for (var i = 2; i <= data.headers.length; i++) {
        sheet.setColumnWidth(i, 140);
      }
      return out(cb, { status: 'ok' });
    }

    if (data.action === 'append') {
      sheet.appendRow(data.row);
      return out(cb, { status: 'ok' });
    }

    if (data.action === 'update') {
      var id = data.row[0];
      var vals = sheet.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === String(id)) {
          sheet.getRange(i + 1, 1, 1, data.row.length).setValues([data.row]);
          return out(cb, { status: 'ok' });
        }
      }
      return out(cb, { status: 'not_found' });
    }

    if (data.action === 'delete') {
      var ids = sheet.getDataRange().getValues();
      for (var j = 1; j < ids.length; j++) {
        if (String(ids[j][0]) === String(data.id)) {
          sheet.deleteRow(j + 1);
          return out(cb, { status: 'ok' });
        }
      }
      return out(cb, { status: 'not_found' });
    }
  }

  var values = sheet.getDataRange().getDisplayValues();
  return out(cb, { values: values });
}

function out(cb, data) {
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(data) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
