# Приёмник ответов для spec.html

Страница ТЗ статическая, поэтому ответы нужно отправлять во внешний приёмник. Настройка — в одном месте: константа `SUBMIT` в начале скрипта `spec.html`.

```js
var SUBMIT = {
  mode: 'off',   // 'gas' | 'formspree' | 'off'
  url: ''
};
```

Пока `mode: 'off'` или `url` пустой, страница работает так: ответы сохраняются в браузере, кнопка отправки неактивна, вместо неё предлагается «Скопировать ответы». Ничего не теряется.

---

## Вариант 1. Google Таблица через Apps Script — рекомендуемый

Ответы падают строками в вашу таблицу. Бесплатно, без сторонних сервисов и лимитов, данные остаются у вас.

### Шаги

1. Создать новую Google Таблицу.
2. В ней: **Расширения → Apps Script**.
3. Удалить содержимое `Код.gs` и вставить скрипт из блока ниже.
4. **Начать развёртывание → Новое развёртывание → Тип: веб-приложение.**
   - *Запуск от имени:* **я**;
   - *У кого есть доступ:* **у всех**.
     Это обязательное условие: страница отправляет запрос от имени анонимного посетителя.
5. Скопировать выданный URL вида `https://script.google.com/macros/s/AKfy.../exec`.
6. В `spec.html` указать:

```js
var SUBMIT = {
  mode: 'gas',
  url: 'https://script.google.com/macros/s/AKfy.../exec'
};
```

### Скрипт для Apps Script

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // лист с построчными ответами
    var sh = ss.getSheetByName('Ответы');
    if (!sh) {
      sh = ss.insertSheet('Ответы');
      sh.appendRow(['Получено', 'ID отправки', 'Раздел', 'Название раздела',
                    'Кто отвечает', 'Вопрос', 'Блокирующий', 'Источник',
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

    // лист с полными отправками — страховка от потери при изменении формата
    var raw = ss.getSheetByName('Журнал');
    if (!raw) {
      raw = ss.insertSheet('Журнал');
      raw.appendRow(['Получено', 'ID отправки', 'Раздел', 'JSON']);
      raw.setFrozenRows(1);
    }
    raw.appendRow([now, data.submissionId, data.topicId, e.postData.contents]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, saved: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('ok');
}
```

### Уведомления о новых ответах

Если нужно письмо при каждой отправке, добавить перед `return` в `doPost`:

```javascript
MailApp.sendEmail({
  to: 'b.klyagin@gmail.com',
  subject: 'ТЗ: ответы по разделу ' + data.topicId,
  body: 'Раздел: ' + data.topicTitle + '\nОтвечает: ' + (data.author || '—') +
        '\nОтветов: ' + rows.length + '\n\nТаблица: ' + ss.getUrl()
});
```

### Проверка

Открыть URL развёртывания в браузере — должно ответить `ok`. Затем отправить ответы со страницы и убедиться, что в таблице появились строки.

При повторном развёртывании скрипта URL меняется — его нужно обновить в `spec.html`.

---

## Вариант 2. Formspree

1. Зарегистрироваться на formspree.io, создать форму, скопировать её ID.
2. В `spec.html`:

```js
var SUBMIT = {
  mode: 'formspree',
  url: 'https://formspree.io/f/XXXXXXX'
};
```

Ответы приходят на email и в панель сервиса. Бесплатный тариф ограничен по числу отправок в месяц; структура письма определяется сервисом.

---

## Как устроена надёжность

| Механизм | Что делает |
| --- | --- |
| Автосохранение | Каждое изменение ответа сразу пишется в `localStorage`. Закрытие вкладки и перезагрузка ответы не теряют |
| Очередь | При неудачной отправке запрос остаётся в очереди и уходит повторно при следующем открытии страницы |
| ID отправки | У каждой отправки свой `submissionId` — повторы из очереди можно отличить от новых ответов |
| Повторная отправка | Раздел можно отправить снова после правок; в таблице видны обе отправки с разными ID |
| Резервная копия | Кнопка «Скопировать ответы» формирует текст для отправки любым каналом, если приёмник недоступен |

Ключи в `localStorage`: `spec.answers.v1` — ответы, `spec.queue.v1` — неотправленное, `spec.sent.v1` — отметки об отправке, `spec.author.v1` — имя отвечающего.

## Ограничение

Данные уходят напрямую из браузера в приёмник, без промежуточного сервера. Адрес приёмника виден в коде страницы — посторонний может отправить в него произвольные данные. Для анкеты согласования это допустимо: записи попадают в отдельные листы и различимы по `ID отправки`. Если понадобится защита от постороннего заполнения, добавляется общий секрет в `SUBMIT` и его проверка в `doPost` — это не отменяет того, что секрет тоже будет виден в коде.
