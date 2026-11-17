'use strict';
// Sends the daily reminder as a web push message.
// Usage: node scripts/send.js [auto|morning|evening]
//  auto    - picks the slot by Moscow time and waits until 10:00 / 21:00
//  morning / evening - sends immediately (manual test)
const webpush = require('web-push');

const MSK_OFFSET_MS = 3 * 3600 * 1000;
const SLOTS = {
  morning: { hour: 10, slot: 'am', body: 'Доброе утро! Какого цвета ваше настроение сейчас?' },
  evening: { hour: 21, slot: 'pm', body: 'Добрый вечер! Какого цвета был ваш день?' }
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const arg = (process.argv[2] || 'auto').trim();
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'https://github.com';
  const rawSub = process.env.PUSH_SUBSCRIPTION;
  const dry = process.env.DRY_RUN === '1';

  if (!pub || !priv) throw new Error('Не заданы ключи VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  if (!rawSub || !rawSub.trim()) throw new Error('Не задан секрет PUSH_SUBSCRIPTION: откройте приложение, Настройки -> Напоминания, и скопируйте код подписки на GitHub');

  let subs;
  try {
    const parsed = JSON.parse(rawSub);
    subs = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    throw new Error('Секрет PUSH_SUBSCRIPTION содержит неверный JSON');
  }

  let kind = arg;
  if (arg === 'auto') {
    const msk = new Date(Date.now() + MSK_OFFSET_MS);
    kind = msk.getUTCHours() < 15 ? 'morning' : 'evening';
    const target = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), SLOTS[kind].hour) - MSK_OFFSET_MS;
    const diff = target - Date.now();
    if (diff > 0 && diff <= 45 * 60 * 1000) {
      console.log('Жду до ' + SLOTS[kind].hour + ':00 МСК: ' + Math.round(diff / 1000) + ' с');
      await sleep(diff);
    } else if (diff < -3 * 3600 * 1000) {
      console.log('Запуск опоздал больше чем на 3 часа, напоминание пропущено');
      return;
    }
  }
  if (!SLOTS[kind]) throw new Error('Неизвестный режим: ' + kind);

  const payload = JSON.stringify({ title: 'Цвет дня', body: SLOTS[kind].body, slot: SLOTS[kind].slot });
  if (dry) { console.log('DRY RUN', kind, payload, 'подписок: ' + subs.length); return; }

  webpush.setVapidDetails(subject, pub, priv);
  let failed = 0;
  for (const sub of subs) {
    try {
      const res = await webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: 'high' });
      console.log('Отправлено, статус ' + res.statusCode);
    } catch (err) {
      failed++;
      console.error('Ошибка отправки: ' + (err.statusCode || '') + ' ' + (err.body || err.message));
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.error('Подписка устарела. Включите уведомления в приложении заново и обновите секрет PUSH_SUBSCRIPTION.');
      }
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
