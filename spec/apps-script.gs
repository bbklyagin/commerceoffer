/**
 * Приёмник ответов по техническому заданию.
 *
 * Установка:
 *   1. Google Таблица → Расширения → Apps Script
 *   2. Удалить всё содержимое файла и вставить этот код целиком
 *   3. Начать развёртывание → Новое развёртывание → Тип: веб-приложение
 *        Запуск от имени:      я
 *        У кого есть доступ:   У ВСЕХ   ← обязательно, иначе страница получит отказ 403
 *   4. Скопировать выданный URL вида https://script.google.com/macros/s/.../exec
 *
 * Токен ниже защищает чтение ответов. Если ссылка на просмотр куда-то попала —
 * поменяйте строку и разверните заново.
 */
var VIEW_TOKEN = '0ace427f067c305f925d081eeff296cb';

/** Приём ответов со страницы технического задания. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var sh = ss.getSheetByName('Ответы');
    if (!sh) {
      sh = ss.insertSheet('Ответы');
      sh.appendRow(['Получено', 'ID отправки', 'Раздел', 'Название раздела',
                    'Кто отвечает', 'Вопрос', 'Блокирующий', 'Пункт',
                    'Текст вопроса', 'Ответ', 'Комментарий']);
      sh.setFrozenRows(1);
    }

    var now = new Date();
    var rows = (data.answers || []).map(function (a) {
      return [now, data.submissionId, data.topicId, data.topicTitle,
              data.author, a.ref, a.blocking ? 'да' : '', a.source,
              a.question, a.answer, a.comment];
    });
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    // полная копия отправки — страховка от потери при изменении формата
    var raw = ss.getSheetByName('Журнал');
    if (!raw) {
      raw = ss.insertSheet('Журнал');
      raw.appendRow(['Получено', 'ID отправки', 'Раздел', 'JSON']);
      raw.setFrozenRows(1);
    }
    raw.appendRow([now, data.submissionId, data.topicId, e.postData.contents]);

    return out({ ok: true, saved: rows.length }, null);
  } catch (err) {
    return out({ ok: false, error: String(err) }, null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Без параметров — проверка живости, отвечает "ok".
 * С параметром k — отдаёт ответы для страницы answers.html.
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var cb = p.callback || null;

  if (!p.k && !cb) return ContentService.createTextOutput('ok');
  if (p.k !== VIEW_TOKEN) return out({ ok: false, error: 'forbidden' }, cb);

  return out(readAnswers(), cb);
}

function readAnswers() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ответы');
  if (!sh || sh.getLastRow() < 2) return { ok: true, rows: [], updated: null };

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  var tz = Session.getScriptTimeZone();
  var rows = values.map(function (r) {
    return {
      at:         isDate(r[0]) ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd HH:mm') : String(r[0]),
      sub:        String(r[1]),
      topicId:    pad2(r[2]),
      topicTitle: String(r[3]),
      author:     String(r[4]),
      ref:        String(r[5]),
      blocking:   String(r[6]) === 'да',
      source:     String(r[7]),
      question:   String(r[8]),
      answer:     String(r[9]),
      comment:    String(r[10])
    };
  });
  return { ok: true, rows: rows, updated: rows.length ? rows[rows.length - 1].at : null };
}

function isDate(v) {
  return v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

/** В таблице «00» превращается в число 0 — возвращаем двузначный вид. */
function pad2(v) {
  var s = String(v == null ? '' : v).trim();
  return /^\d$/.test(s) ? '0' + s : s;
}

function out(body, cb) {
  var json = JSON.stringify(body);
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
