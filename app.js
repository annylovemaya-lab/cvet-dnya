/* Цвет дня — цветовой дневник настроения. ver. 1.1 */
(function () {
  'use strict';

  var VERSION = '1.1';
  var VAPID_PUBLIC = 'BHMn5qD9fro5z00KWfBW7xqLHterUXmLXmmIBOTNcQULDWhgfl7SC-mBvbxcBzrXOCrXjrLksR3SJ9WqCPUbqug';
  var STORE = 'mt_state_v1';

  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var SLOT_NAME = { am: 'Утро', pm: 'Вечер' };

  var DEFAULT_MOODS = [
    { id: 'joy', name: 'Радость', color: '#F7C873' },
    { id: 'calm', name: 'Спокойствие', color: '#8CC9B8' },
    { id: 'energy', name: 'Энергия', color: '#F29C7A' },
    { id: 'inspire', name: 'Вдохновение', color: '#C3A4E0' },
    { id: 'tender', name: 'Нежность', color: '#F4A9C0' },
    { id: 'sad', name: 'Грусть', color: '#7FA6D6' },
    { id: 'tired', name: 'Усталость', color: '#A9A39B' },
    { id: 'anx', name: 'Тревога', color: '#D98B8B' }
  ];

  /* ---------- состояние ---------- */
  function normalize(s) {
    s = s || {};
    return {
      moods: Array.isArray(s.moods) && s.moods.length ? s.moods : DEFAULT_MOODS.map(function (m) { return Object.assign({}, m); }),
      blend: s.blend === 'paint' ? 'paint' : 'avg',
      view: s.view === 'split' ? 'split' : 'blend',
      entries: s.entries && typeof s.entries === 'object' ? s.entries : {}
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return normalize({});
  }
  var S = load();
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  var now0 = new Date();
  var ui = { view: 'year', year: now0.getFullYear(), month: now0.getMonth(), sheetDate: null, sheetSlot: 'am', restoreOpen: false };

  /* ---------- утилиты ---------- */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayKey() { var t = new Date(); return key(t.getFullYear(), t.getMonth(), t.getDate()); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'm' + Math.random().toString(36).slice(2, 9); }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function firstDow(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }
  function suggestSlot() { return new Date().getHours() < 15 ? 'am' : 'pm'; }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2400);
  }

  /* ---------- цвет ---------- */
  function hex2rgb(h) {
    h = String(h || '#cccccc').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0xcccccc;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(c) {
    return '#' + c.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) {
    c = Math.max(0, Math.min(1, c));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
  function rgb2lab(c) {
    var r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function lab2rgb(c) {
    var L = c[0], a = c[1], b = c[2];
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  /* RGB <-> RYB (смешивание «как красками»: синий + жёлтый = зелёный) */
  function rgb2ryb(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var w = Math.min(r, g, b); r -= w; g -= w; b -= w;
    var mg = Math.max(r, g, b);
    var y = Math.min(r, g); r -= y; g -= y;
    if (b && g) { b /= 2; g /= 2; }
    y += g; b += g;
    var my = Math.max(r, y, b);
    if (my) { var n = mg / my; r *= n; y *= n; b *= n; }
    return [r + w, y + w, b + w];
  }
  function ryb2rgb(c) {
    var r = c[0], y = c[1], b = c[2];
    var w = Math.min(r, y, b); r -= w; y -= w; b -= w;
    var my = Math.max(r, y, b);
    var g = Math.min(y, b); y -= g; b -= g;
    if (b && g) { b *= 2; g *= 2; }
    r += y; g += y;
    var mg = Math.max(r, g, b);
    if (mg) { var n = my / mg; r *= n; g *= n; b *= n; }
    return [(r + w) * 255, (g + w) * 255, (b + w) * 255];
  }
  function mixColors(a, b, mode) {
    var ca = hex2rgb(a), cb = hex2rgb(b);
    if (mode === 'paint') {
      var ra = rgb2ryb(ca), rb = rgb2ryb(cb);
      var m = [(ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2, (ra[2] + rb[2]) / 2];
      var out = ryb2rgb(m);
      return rgb2hex(out);
    }
    var la = rgb2lab(ca), lb = rgb2lab(cb);
    return rgb2hex(lab2rgb([(la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2, (la[2] + lb[2]) / 2]));
  }

  /* ---------- данные дня ---------- */
  function moodById(id) {
    for (var i = 0; i < S.moods.length; i++) if (S.moods[i].id === id) return S.moods[i];
    return null;
  }
  function slotColor(sl) {
    if (!sl || !sl.m) return null;
    var m = moodById(sl.m);
    return m ? m.color : (sl.c || null);
  }
  function slotName(sl) {
    if (!sl || !sl.m) return '';
    var m = moodById(sl.m);
    return m ? m.name : (sl.nm || '');
  }
  function dayBackground(dk) {
    var e = S.entries[dk];
    if (!e) return null;
    var a = slotColor(e.am), p = slotColor(e.pm);
    if (!a && !p) return null;
    if (S.view === 'split') {
      return 'linear-gradient(90deg,' + (a || 'var(--empty)') + ' 50%,' + (p || 'var(--empty)') + ' 50%)';
    }
    if (a && p) return mixColors(a, p, S.blend);
    return a || p;
  }
  function getSlot(dk, slot) {
    return (S.entries[dk] && S.entries[dk][slot]) || null;
  }
  function setSlot(dk, slot, patch) {
    var e = S.entries[dk] || (S.entries[dk] = {});
    var sl = e[slot] || (e[slot] = {});
    Object.keys(patch).forEach(function (k) { sl[k] = patch[k]; });
    cleanup(dk);
    save();
  }
  function cleanup(dk) {
    var e = S.entries[dk];
    if (!e) return;
    ['am', 'pm'].forEach(function (s) {
      var sl = e[s];
      if (sl && !sl.m && !sl.e && !(sl.n && sl.n.trim())) delete e[s];
    });
    if (!e.am && !e.pm) delete S.entries[dk];
  }

  /* ---------- сегменты ---------- */
  function segHtml(items, cur) {
    return items.map(function (it) {
      return '<button data-v="' + it[0] + '" class="' + (it[0] === cur ? 'on' : '') + '">' + it[1] + '</button>';
    }).join('');
  }
  var VIEW_ITEMS = [['blend', 'Смесь'], ['split', 'Утро · Вечер']];

  /* ---------- легенда ---------- */
  function legendHtml() {
    return S.moods.map(function (m) {
      return '<span class="chip"><i style="background:' + esc(m.color) + '"></i>' + esc(m.name) + '</span>';
    }).join('');
  }

  /* ---------- год ---------- */
  function renderYear() {
    $('year-title').textContent = ui.year;
    $('seg-year').innerHTML = segHtml(VIEW_ITEMS, S.view);
    var tk = todayKey();
    var html = '';
    for (var m = 0; m < 12; m++) {
      var cells = '';
      var pads = firstDow(ui.year, m);
      for (var p = 0; p < pads; p++) cells += '<div class="dot pad"></div>';
      var n = daysIn(ui.year, m);
      for (var d = 1; d <= n; d++) {
        var dk = key(ui.year, m, d);
        var bg = dayBackground(dk);
        cells += '<div class="dot' + (dk === tk ? ' today' : '') + '"' + (bg ? ' style="background:' + bg + '"' : '') + '></div>';
      }
      html += '<button class="mcard" data-m="' + m + '"><div class="mname">' + MONTHS[m] + '</div><div class="mgrid">' + cells + '</div></button>';
    }
    $('year-grid').innerHTML = html;
    $('legend-year').innerHTML = legendHtml();
    renderNudge();
  }

  function renderNudge() {
    var el = $('nudge');
    var tk = todayKey();
    var h = new Date().getHours();
    var slot = null;
    if (!getSlot(tk, 'am') && h >= 10) slot = 'am';
    else if (!getSlot(tk, 'pm') && h >= 21) slot = 'pm';
    if (!slot || ui.year !== new Date().getFullYear()) { el.classList.add('hidden'); el.dataset.slot = ''; return; }
    el.dataset.slot = slot;
    el.textContent = slot === 'am' ? 'Утро сегодня ещё не отмечено — нажмите, чтобы выбрать цвет' : 'Вечер сегодня ещё не отмечен — нажмите, чтобы выбрать цвет';
    el.classList.remove('hidden');
  }

  /* ---------- месяц ---------- */
  function renderMonth() {
    $('month-title').textContent = MONTHS[ui.month].charAt(0).toUpperCase() + MONTHS[ui.month].slice(1) + ' ' + ui.year;
    $('seg-month').innerHTML = segHtml(VIEW_ITEMS, S.view);
    $('weekdays').innerHTML = WEEKDAYS.map(function (w) { return '<div>' + w + '</div>'; }).join('');
    var tk = todayKey();
    var cells = '';
    var pads = firstDow(ui.year, ui.month);
    for (var p = 0; p < pads; p++) cells += '<div class="cell pad"></div>';
    var n = daysIn(ui.year, ui.month);
    for (var d = 1; d <= n; d++) {
      var dk = key(ui.year, ui.month, d);
      var bg = dayBackground(dk);
      var cls = 'cell' + (bg ? '' : ' empty') + (dk === tk ? ' today' : '') + (dk > tk ? ' future' : '');
      cells += '<button class="' + cls + '" data-d="' + dk + '"' + (bg ? ' style="background:' + bg + '"' : '') + '><span>' + d + '</span></button>';
    }
    $('month-grid').innerHTML = cells;
    $('legend-month').innerHTML = legendHtml();
    renderStats();
  }

  function renderStats() {
    var counts = {}, total = 0, eSum = 0, eN = 0, filled = 0;
    var n = daysIn(ui.year, ui.month);
    for (var d = 1; d <= n; d++) {
      var e = S.entries[key(ui.year, ui.month, d)];
      if (!e) continue;
      filled++;
      ['am', 'pm'].forEach(function (s) {
        var sl = e[s];
        if (!sl) return;
        if (sl.m) { counts[sl.m] = (counts[sl.m] || 0) + 1; total++; }
        if (sl.e) { eSum += sl.e; eN++; }
      });
    }
    var el = $('month-stats');
    if (!total) { el.innerHTML = ''; return; }
    var rows = Object.keys(counts).map(function (id) {
      var m = moodById(id);
      var color = m ? m.color : '#ccc';
      var name = m ? m.name : '—';
      if (!m) {
        // найти снимок в записях
        Object.keys(S.entries).forEach(function (dk) {
          ['am', 'pm'].forEach(function (s) {
            var sl = S.entries[dk][s];
            if (sl && sl.m === id) { color = sl.c || color; name = sl.nm || name; }
          });
        });
      }
      return { n: counts[id], color: color, name: name };
    }).sort(function (a, b) { return b.n - a.n; });
    var max = rows[0].n;
    var html = '<h3>Итоги месяца</h3>';
    rows.forEach(function (r) {
      html += '<div class="srow"><div class="nm">' + esc(r.name) + '</div><div class="bar"><b style="width:' + Math.round(r.n / max * 100) + '%;background:' + esc(r.color) + '"></b></div><div class="n">' + r.n + '</div></div>';
    });
    if (eN) html += '<div class="srow"><div class="nm">Ср. энергия</div><div class="bar"></div><div class="n">' + (eSum / eN).toFixed(1) + '</div></div>';
    el.innerHTML = html;
  }

  /* ---------- лист дня ---------- */
  function openSheet(dk, slot) {
    ui.sheetDate = dk;
    ui.sheetSlot = slot || suggestSlot();
    $('sheet-wrap').classList.remove('hidden');
    renderSheet(true);
  }
  function closeSheet() {
    $('sheet-wrap').classList.add('hidden');
    ui.sheetDate = null;
    rerender();
  }
  function renderSheet(full) {
    var dk = ui.sheetDate;
    if (!dk) return;
    var p = dk.split('-');
    var y = +p[0], m = +p[1] - 1, d = +p[2];
    var wd = (new Date(y, m, d).getDay() + 6) % 7;
    $('sheet-date').textContent = d + ' ' + MONTHS_GEN[m] + ', ' + WEEKDAYS[wd].toLowerCase();
    var e = S.entries[dk] || {};
    var an = slotName(e.am), pn = slotName(e.pm);
    $('sheet-sub').textContent = 'Утро: ' + (an || '—') + '  ·  Вечер: ' + (pn || '—');
    var bg = dayBackground(dk);
    $('sheet-preview').style.background = bg || 'var(--empty)';
    $('seg-slot').innerHTML = segHtml([['am', 'Утро'], ['pm', 'Вечер']], ui.sheetSlot);
    if (!full) return;
    var sl = getSlot(dk, ui.sheetSlot) || {};
    var html = '<div class="moods">';
    S.moods.forEach(function (mo) {
      html += '<button class="mood' + (sl.m === mo.id ? ' on' : '') + '" data-m="' + esc(mo.id) + '"><i style="background:' + esc(mo.color) + '"></i><span>' + esc(mo.name) + '</span></button>';
    });
    html += '</div><div class="lbl">Энергия</div><div class="energy">';
    for (var i = 1; i <= 5; i++) html += '<button data-e="' + i + '" class="' + (sl.e === i ? 'on' : '') + '">' + i + '</button>';
    html += '</div><div class="lbl">Заметка</div><textarea id="note" placeholder="Что повлияло на настроение?" maxlength="600">' + esc(sl.n || '') + '</textarea>';
    html += '<div class="row-actions"><button class="btn soft" id="slot-clear">Очистить ' + (ui.sheetSlot === 'am' ? 'утро' : 'вечер') + '</button><button class="btn" id="slot-done">Готово</button></div>';
    $('sheet-body').innerHTML = html;
  }

  /* ---------- настройки ---------- */
  function isStandalone() {
    return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  }
  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function mixDemoHtml() {
    var a = S.moods[0], b = S.moods[Math.min(5, S.moods.length - 1)];
    if (!a || !b) return '';
    return '<div class="mix-demo"><i style="background:' + esc(a.color) + '"></i><em>+</em><i style="background:' + esc(b.color) + '"></i><em>=</em><i style="background:' + mixColors(a.color, b.color, S.blend) + '"></i></div>';
  }
  function renderSettings() {
    var html = '';

    html += '<div class="card"><h2>Настроения и цвета</h2><p>Меняйте названия и цвета, добавляйте свои. Уже сделанные отметки перекрасятся.</p><div id="moods-edit">';
    S.moods.forEach(function (m) {
      html += '<div class="mrow" data-id="' + esc(m.id) + '"><input type="color" value="' + esc(m.color) + '"><input type="text" value="' + esc(m.name) + '" maxlength="24"><button class="del" aria-label="Удалить">✕</button></div>';
    });
    html += '</div><div class="row-actions"><button class="btn soft" id="mood-add">+ Добавить</button><button class="btn soft" id="mood-reset">Стандартные</button></div></div>';

    html += '<div class="card"><h2>Цвет дня</h2><p>Как складываются цвета утра и вечера.</p>';
    html += '<div class="radio' + (S.blend === 'avg' ? ' on' : '') + '" data-blend="avg"><div class="rb"></div><div><b>Усреднение</b><small>Мягкий средний оттенок между утром и вечером</small></div></div>';
    html += '<div class="radio' + (S.blend === 'paint' ? ' on' : '') + '" data-blend="paint"><div class="rb"></div><div><b>Как краски</b><small>Синий + жёлтый дают зелёный, красный + жёлтый — оранжевый</small></div></div>';
    html += '<div id="mix-demo-wrap">' + mixDemoHtml() + '</div></div>';

    html += '<div class="card"><h2>Напоминания</h2><p>Каждый день в 10:00 и в 21:00 по Москве. Время запуска задаёт таймер на cron-job.org.</p><div id="push-status" class="status"></div>';
    html += '<div class="row-actions"><button class="btn" id="push-enable">Включить уведомления</button><button class="btn soft" id="push-test">Проверить</button></div>';
    html += '<div id="push-sub-wrap" class="hidden"><ol class="steps"><li>Нажмите «Скопировать код».</li><li>На GitHub: репозиторий → Settings → Secrets and variables → Actions → New repository secret.</li><li>Имя: <b>PUSH_SUBSCRIPTION</b>, значение — скопированный код.</li></ol><textarea id="push-sub" class="mono" readonly></textarea><div class="row-actions"><button class="btn soft" id="push-copy">Скопировать код</button></div></div></div>';

    html += '<div class="card"><h2>Резервная копия</h2><p>Данные хранятся на этом телефоне. Копия поможет перенести их или восстановить.</p><div class="row-actions"><button class="btn soft" id="bk-copy">Скопировать данные</button><button class="btn soft" id="bk-restore">Восстановить</button></div>';
    html += '<div id="bk-wrap" class="' + (ui.restoreOpen ? '' : 'hidden') + '" style="margin-top:12px"><textarea id="bk-text" class="mono" placeholder="Вставьте сюда скопированные данные"></textarea><div class="row-actions"><button class="btn" id="bk-apply">Применить</button></div></div></div>';

    html += '<div class="ver">Цвет дня · ver. ' + VERSION + '</div>';
    $('settings-body').innerHTML = html;
    refreshPushStatus();
  }

  function refreshPushStatus() {
    var el = $('push-status');
    if (!el) return;
    var txt, ok = false;
    if (!pushSupported()) txt = 'Этот браузер не поддерживает уведомления. Нужен iOS 16.4 или новее.';
    else if (!isStandalone()) txt = 'Откройте приложение с экрана «Домой»: в Safari уведомления недоступны.';
    else if (Notification.permission === 'denied') txt = 'Уведомления запрещены. Разрешите их в Настройки iPhone → Уведомления → Цвет дня.';
    else if (Notification.permission === 'granted') {
      var has = !!localStorage.getItem('mt_sub');
      txt = has ? 'Уведомления включены. Если вы уже добавили код подписки на GitHub — всё готово.' : 'Разрешение получено. Осталось включить подписку.';
      ok = has;
    } else txt = 'Уведомления ещё не включены.';
    el.textContent = txt;
    el.classList.toggle('ok', ok);
    var saved = localStorage.getItem('mt_sub');
    if (saved && Notification.permission === 'granted') {
      $('push-sub-wrap').classList.remove('hidden');
      $('push-sub').value = saved;
    }
  }

  function b64ToU8(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function enablePush() {
    if (!pushSupported()) { toast('Уведомления не поддерживаются'); return; }
    if (!isStandalone()) { toast('Откройте приложение с экрана «Домой»'); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { refreshPushStatus(); toast('Разрешение не выдано'); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
        });
      }).then(function (sub) {
        localStorage.setItem('mt_sub', JSON.stringify(sub.toJSON()));
        refreshPushStatus();
        toast('Готово. Скопируйте код подписки');
      });
    }).catch(function (err) {
      toast('Не удалось включить: ' + (err && err.message ? err.message : err));
    });
  }

  function testNotification() {
    if (!pushSupported() || Notification.permission !== 'granted') { toast('Сначала включите уведомления'); return; }
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification('Цвет дня', { body: 'Так будет выглядеть напоминание', icon: 'icons/icon-192.png', data: { slot: suggestSlot() } });
    }).catch(function () { toast('Не получилось показать уведомление'); });
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (e) { toast('Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  function applyBackup() {
    var txt = ($('bk-text').value || '').trim();
    try {
      var data = JSON.parse(txt);
      if (!data || typeof data !== 'object' || !data.entries) throw new Error('bad');
      if (!window.confirm('Заменить текущие данные восстановленными?')) return;
      S = normalize(data);
      save();
      ui.restoreOpen = false;
      renderSettings();
      toast('Данные восстановлены');
    } catch (e) { toast('Не похоже на копию данных'); }
  }

  /* ---------- навигация ---------- */
  function show(view) {
    ui.view = view;
    ['year', 'month', 'settings'].forEach(function (v) {
      $('view-' + v).classList.toggle('hidden', v !== view);
    });
    $('fab').classList.toggle('hidden', view === 'settings');
    rerender();
    window.scrollTo(0, 0);
  }
  function rerender() {
    if (ui.view === 'year') renderYear();
    else if (ui.view === 'month') renderMonth();
    else refreshPushStatus();
  }

  /* ---------- события ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    function up(sel) { return t.closest ? t.closest(sel) : null; }
    var el;

    if (up('#year-prev')) { ui.year--; renderYear(); return; }
    if (up('#year-next')) { ui.year++; renderYear(); return; }
    if (up('#open-settings')) { show('settings'); renderSettings(); return; }
    if (up('#settings-back')) { show('year'); return; }
    if (up('#month-back')) { show('year'); return; }
    if (up('#month-prev')) { ui.month--; if (ui.month < 0) { ui.month = 11; ui.year--; } renderMonth(); return; }
    if (up('#month-next')) { ui.month++; if (ui.month > 11) { ui.month = 0; ui.year++; } renderMonth(); return; }

    if ((el = up('#seg-year button')) || (el = up('#seg-month button'))) {
      S.view = el.dataset.v; save(); rerender(); return;
    }
    if ((el = up('.mcard'))) { ui.month = +el.dataset.m; show('month'); return; }
    if ((el = up('.cell[data-d]'))) {
      if (el.classList.contains('future')) return;
      openSheet(el.dataset.d, suggestSlot()); return;
    }
    if (up('#fab')) { openSheet(todayKey(), suggestSlot()); return; }
    if ((el = up('#nudge'))) { if (el.dataset.slot) openSheet(todayKey(), el.dataset.slot); return; }

    /* лист */
    if (up('#sheet-backdrop') || up('#sheet-close') || up('#slot-done')) { closeSheet(); return; }
    if ((el = up('#seg-slot button'))) { ui.sheetSlot = el.dataset.v; renderSheet(true); return; }
    if ((el = up('.mood'))) {
      var mo = moodById(el.dataset.m);
      var cur = getSlot(ui.sheetDate, ui.sheetSlot);
      if (cur && cur.m === el.dataset.m) setSlot(ui.sheetDate, ui.sheetSlot, { m: null, c: null, nm: null });
      else setSlot(ui.sheetDate, ui.sheetSlot, { m: mo.id, c: mo.color, nm: mo.name });
      renderSheet(true); return;
    }
    if ((el = up('.energy button'))) {
      var ev2 = +el.dataset.e;
      var c2 = getSlot(ui.sheetDate, ui.sheetSlot);
      setSlot(ui.sheetDate, ui.sheetSlot, { e: c2 && c2.e === ev2 ? 0 : ev2 });
      renderSheet(true); return;
    }
    if (up('#slot-clear')) {
      var e = S.entries[ui.sheetDate];
      if (e) { delete e[ui.sheetSlot]; cleanup(ui.sheetDate); save(); }
      renderSheet(true); return;
    }

    /* настройки */
    if (up('#mood-add')) { S.moods.push({ id: uid(), name: 'Новое', color: '#B8A9C9' }); save(); renderSettings(); return; }
    if (up('#mood-reset')) {
      if (window.confirm('Вернуть стандартный набор настроений?')) {
        S.moods = DEFAULT_MOODS.map(function (m) { return Object.assign({}, m); }); save(); renderSettings();
      }
      return;
    }
    if ((el = up('.mrow .del'))) {
      var row = el.parentNode, id = row.dataset.id;
      if (S.moods.length <= 1) { toast('Нужно оставить хотя бы одно настроение'); return; }
      if (!window.confirm('Удалить это настроение? В прошлых отметках цвет сохранится.')) return;
      var mm = moodById(id);
      Object.keys(S.entries).forEach(function (dk) {
        ['am', 'pm'].forEach(function (s) {
          var sl = S.entries[dk][s];
          if (sl && sl.m === id && mm) { sl.c = mm.color; sl.nm = mm.name; }
        });
      });
      S.moods = S.moods.filter(function (m) { return m.id !== id; });
      save(); renderSettings(); return;
    }
    if ((el = up('.radio[data-blend]'))) { S.blend = el.dataset.blend; save(); renderSettings(); return; }
    if (up('#push-enable')) { enablePush(); return; }
    if (up('#push-test')) { testNotification(); return; }
    if (up('#push-copy')) { copyText($('push-sub').value, 'Код скопирован'); return; }
    if (up('#bk-copy')) { copyText(JSON.stringify(S), 'Данные скопированы'); return; }
    if (up('#bk-restore')) { ui.restoreOpen = !ui.restoreOpen; $('bk-wrap').classList.toggle('hidden', !ui.restoreOpen); return; }
    if (up('#bk-apply')) { applyBackup(); return; }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'note') {
      setSlot(ui.sheetDate, ui.sheetSlot, { n: t.value });
      return;
    }
    var row = t.closest && t.closest('.mrow');
    if (row) {
      var m = moodById(row.dataset.id);
      if (!m) return;
      if (t.type === 'color') m.color = t.value;
      else m.name = t.value.trim() || 'Без названия';
      save();
      var wrap = $('mix-demo-wrap');
      if (wrap) wrap.innerHTML = mixDemoHtml();
    }
  });

  /* ---------- запуск ---------- */
  function handleSlotParam() {
    var m = /[?&]slot=(am|pm)/.exec(location.search);
    if (m) {
      openSheet(todayKey(), m[1]);
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    }
  }

  document.title = 'Цвет дня · ver. ' + VERSION;
  renderYear();
  handleSlotParam();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.type === 'open-slot') openSheet(todayKey(), ev.data.slot === 'pm' ? 'pm' : 'am');
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !ui.sheetDate) rerender();
  });
})();
