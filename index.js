const { Telegraf, Markup, session } = require('telegraf');
const { google } = require('googleapis');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// =========================
// CONFIG
// =========================
const CHANNEL_URL = 'https://t.me/kptgkp';
const CONTACT_PHONE_DISPLAY = '056 747 36 07';

const MIN_MESSAGE_INTERVAL_MS = 1200;      // антифлуд между сообщениями
const MIN_FORM_SUBMIT_INTERVAL_MS = 60000; // антиспам между отправками формы (60 сек)
const MAX_TEXT_LEN = 500;

// =========================
// GOOGLE SHEETS
// =========================
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

async function appendRow(sheetName, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row]
    }
  });
}

// =========================
// KEYBOARDS
// =========================
function mainMenuInline() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Передати показники', 'meters_start'),
      Markup.button.callback('🧾 Залишити заявку', 'request_start')
    ],
    [
      Markup.button.url('📢 Канал ТЖКП', CHANNEL_URL),
      Markup.button.callback('📞 Контакт центр', 'contact_center')
    ]
  ]);
}

const YES_NO = Markup.keyboard([['Так', 'Ні']]).resize();
const CONFIRM_KB = Markup.keyboard([['Вірно', 'Змінити']]).resize();
const REMOVE_KB = Markup.removeKeyboard();

// =========================
// TEXTS
// =========================
const START_TEXT =
  'Вас вітає віртуальний помічник КП «ТЖКП»! 👋\n\n' +
  'За моєю допомогою ви можете передати показники приладів обліку, оформити заявку або отримати актуальну інформацію.';

const WATER_INFO_TEXT =
  'Актуальну інформацію щодо аварійних ситуацій, ремонтних робіт, відключень або відновлення послуг, а також руху транспорту ви можете переглянути в офіційному Telegram-каналі КП «ТЖКП»:\n\n' +
  'https://t.me/kptgkp';

const ELECTRICITY_TEXT =
  'КП «ТЖКП» не є постачальником або виробником електричної енергії, тому з цього питання рекомендуємо звернутися до вашого постачальника електроенергії, з яким у вас укладено договір (наприклад, це може бути ДТЕК або ЦЕК).\n\n' +
  'Також рекомендуємо слідкувати за графіками відключень електроенергії та інформацією про проведення ремонтних робіт на офіційних ресурсах енергетичних компаній.\n\n' +
  'Комунальне підприємство «Тернівське житлово-комунальне підприємство» не надає послуги постачання електричної енергії.';

const PAYMENT_TEXT =
  '(1) Онлайн-оплата:\n' +
  'Ви можете здійснити оплату онлайн за посиланням:\n' +
  'https://tgkp.com.ua/pay/#top\n\n' +
  '(2) Фізична оплата:\n' +
  'Також оплату можна здійснити особисто за адресою:\n' +
  'м. Тернівка, вул. Григорія Сковороди, 11\n\n' +
  '(3) Графік роботи:\n' +
  'Понеділок – четвер з 8:00 до 16:30, пʼятниця з 8:00 до 16:00 (без перерви)\n\n' +
  '(4) Графік роботи абонентського відділу:\n' +
  'Абонентський відділ: понеділок – четвер з 8:00 до 17:00 (перерва з 12:00 до 13:00)\n\n' +
  '(5) Завершення:\n' +
  'Якщо у вас виникнуть запитання — із задоволенням допоможу!';

const TARIFF_TEXT =
  'Актуальні тарифи КП «ТЖКП» ви можете переглянути на офіційному сайті:\nhttps://tgkp.com.ua/tariff/';

// =========================
// SESSION HELPERS
// =========================
function resetSession(ctx) {
  ctx.session = {
    flow: null,
    step: null,
    data: {},
    lastMessageAt: 0,
    lastSubmitAt: 0
  };
}

function ensureSession(ctx) {
  if (!ctx.session) resetSession(ctx);
  if (!ctx.session.data) ctx.session.data = {};
  if (!ctx.session.lastMessageAt) ctx.session.lastMessageAt = 0;
  if (!ctx.session.lastSubmitAt) ctx.session.lastSubmitAt = 0;
}

async function sendMainMenu(ctx, text = START_TEXT) {
  resetSession(ctx);
  return ctx.reply(text, mainMenuInline());
}

// =========================
// VALIDATION
// =========================
function normalizePhone(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+38${digits}`;
  return null;
}

function isValidFullName(input) {
  const v = String(input || '').trim();
  if (v.length < 4 || v.length > 70) return false;
  return /^[A-Za-zА-Яа-яІіЇїЄєҐґЁё'’` -]+$/.test(v);
}

function isValidAccount(input) {
  return /^\d{5,20}$/.test(String(input || '').trim());
}

function isValidAddress(input) {
  const v = String(input || '').trim();
  if (v.length < 5 || v.length > 120) return false;
  return !/^[^A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9]+$/.test(v);
}

function isValidMeterNumber(input) {
  return /^[A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9/-]{3,30}$/.test(String(input || '').trim());
}

function isValidMeterValue(input) {
  return /^\d{1,10}$/.test(String(input || '').trim());
}

function isValidRequestText(input) {
  const v = String(input || '').trim();
  if (v.length < 5 || v.length > 500) return false;
  return !/^(.)\1{4,}$/.test(v); // aaaaa / 11111
}

function isGarbageText(input) {
  const v = String(input || '').trim();
  if (!v) return true;
  if (v.length > MAX_TEXT_LEN) return true;
  if (/^(.)\1{5,}$/.test(v)) return true;
  if (/^[!@#$%^&*()_+=\-=[\]{};':"\\|,.<>/?`~]+$/.test(v)) return true;
  return false;
}

function formatMetersConfirmation(d) {
  return (
    'Перевірте дані:\n\n' +
    `Телефон: ${d.phone || '-'}\n` +
    `ПІБ: ${d.fullName || '-'}\n` +
    `Особистий рахунок: ${d.account || '-'}\n` +
    `Адреса: ${d.address || '-'}\n` +
    `Лічильник №1: ${d.meter1Number || '-'}\n` +
    `Показники №1: ${d.meter1Value || '-'}\n` +
    `Другий лічильник: ${d.hasSecondMeter || '-'}\n` +
    `Лічильник №2: ${d.meter2Number || '-'}\n` +
    `Показники №2: ${d.meter2Value || '-'}`
  );
}

function canProcessMessage(ctx) {
  ensureSession(ctx);
  const now = Date.now();
  if (now - ctx.session.lastMessageAt < MIN_MESSAGE_INTERVAL_MS) {
    return false;
  }
  ctx.session.lastMessageAt = now;
  return true;
}

function canSubmitForm(ctx) {
  ensureSession(ctx);
  const now = Date.now();
  if (now - ctx.session.lastSubmitAt < MIN_FORM_SUBMIT_INTERVAL_MS) {
    return false;
  }
  ctx.session.lastSubmitAt = now;
  return true;
}

// =========================
// INTENTS RU + UA
// =========================
function includesAny(text, arr) {
  const t = text.toLowerCase();
  return arr.some(k => t.includes(k));
}

function isWaterRelated(text) {
  return includesAny(text, [
    // UA
    'авар', 'ремонт', 'водопостач', 'немає води', 'відсутність води',
    'відсутність водопостачання', 'немає тепла', 'відсутність теплопостачання',
    'відновлення водопостачання', 'відновлення теплопостачання',
    'обмеження водопостачання', 'маршрут', 'автобус', 'відсутність автобуса',
    // RU
    'авария', 'ремонтные работы', 'нет воды', 'отсутствие воды',
    'нет отопления', 'отсутствие отопления', 'восстановление водоснабжения',
    'восстановление отопления', 'ограничение водоснабжения',
    'маршрутный автобус', 'нет автобуса'
  ]);
}

function isElectricityRelated(text) {
  return includesAny(text, [
    // UA
    'немає світла', 'відключили світло', 'чому немає електрики',
    'коли дадуть світло', 'електропостач', 'електроенер',
    // RU
    'нет света', 'отключили свет', 'почему нет электричества',
    'когда дадут свет', 'проблемы с электроснабжением', 'электриче'
  ]);
}

function isPaymentRelated(text) {
  return includesAny(text, [
    // UA
    'оплат', 'заплатити', 'платіж', 'де оплатити', 'як оплатити', 'як внести оплату',
    // RU
    'оплата', 'оплатить', 'заплатить', 'платеж', 'где оплатить', 'как оплатить',
    // EN
    'pay', 'payment', 'invoice'
  ]);
}

function isTariffRelated(text) {
  return includesAny(text, [
    // UA
    'тариф', 'вартість послуг', 'ціни на воду', 'ціни на тепло', 'абонплата',
    'вивіз сміття',
    // RU
    'тариф', 'стоимость услуг', 'цены на воду', 'цены на тепло', 'абонплата',
    'вывоз мусора'
  ]);
}

// =========================
// START / MENU
// =========================
bot.start(async (ctx) => {
  await sendMainMenu(ctx);
});

bot.action('contact_center', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(`Контакт центр: ${CONTACT_PHONE_DISPLAY}`);
});

// =========================
// FLOW STARTS
// =========================
bot.action('meters_start', async (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'meters';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  await ctx.answerCbQuery();
  return ctx.reply(
    'Введіть номер телефону у форматі:\n+380XXXXXXXXX або 0XXXXXXXXX',
    REMOVE_KB
  );
});

bot.action('request_start', async (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'request';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  await ctx.answerCbQuery();
  return ctx.reply(
    'Вкажіть ваш телефон у форматі:\n+380XXXXXXXXX або 0XXXXXXXXX',
    REMOVE_KB
  );
});

// =========================
// TEXT HANDLER
// =========================
bot.on('text', async (ctx) => {
  ensureSession(ctx);

  if (!canProcessMessage(ctx)) {
    return;
  }

  const text = (ctx.message.text || '').trim();
  if (isGarbageText(text)) {
    return ctx.reply('❌ Некоректне повідомлення. Введіть нормальні дані.');
  }

  // =====================
  // FLOW: METERS
  // =====================
  if (ctx.session.flow === 'meters') {
    const d = ctx.session.data;

    if (ctx.session.step === 'phone') {
      const phone = normalizePhone(text);
      if (!phone) {
        return ctx.reply(
          '❌ Невірний номер телефону.\nВведіть український номер у форматі:\n+380XXXXXXXXX або 0XXXXXXXXX'
        );
      }
      d.phone = phone;
      ctx.session.step = 'fullName';
      return ctx.reply('Прізвище, імʼя:');
    }

    if (ctx.session.step === 'fullName') {
      if (!isValidFullName(text)) {
        return ctx.reply(
          '❌ Невірно введено ПІБ.\nВведіть тільки імʼя та прізвище, без цифр і сторонніх символів.'
        );
      }
      d.fullName = text;
      ctx.session.step = 'account';
      return ctx.reply('Особистий рахунок:');
    }

    if (ctx.session.step === 'account') {
      if (!isValidAccount(text)) {
        return ctx.reply(
          '❌ Невірний особистий рахунок.\nДозволені тільки цифри, від 5 до 20 символів.'
        );
      }
      d.account = text;
      ctx.session.step = 'address';
      return ctx.reply('Адреса (вулиця, будинок, квартира):');
    }

    if (ctx.session.step === 'address') {
      if (!isValidAddress(text)) {
        return ctx.reply(
          '❌ Невірна адреса.\nВведіть повну адресу: вулиця, будинок, квартира.'
        );
      }
      d.address = text;
      ctx.session.step = 'meter1Number';
      return ctx.reply('Вкажіть номер лічильника №1:');
    }

    if (ctx.session.step === 'meter1Number') {
      if (!isValidMeterNumber(text)) {
        return ctx.reply(
          '❌ Невірний номер лічильника.\nМожна вводити букви, цифри, "/" або "-".'
        );
      }
      d.meter1Number = text;
      ctx.session.step = 'meter1Value';
      return ctx.reply('Введіть поточні показники лічильника №1:');
    }

    if (ctx.session.step === 'meter1Value') {
      if (!isValidMeterValue(text)) {
        return ctx.reply(
          '❌ Невірні показники.\nВведіть тільки цифри, без букв і знаків.'
        );
      }
      d.meter1Value = text;
      ctx.session.step = 'hasSecondMeter';
      return ctx.reply('Чи є у вас другий лічильник?', YES_NO);
    }

    if (ctx.session.step === 'hasSecondMeter') {
      if (text === 'Так') {
        d.hasSecondMeter = 'Так';
        ctx.session.step = 'meter2Number';
        return ctx.reply('Вкажіть номер лічильника №2:', REMOVE_KB);
      }

      if (text === 'Ні') {
        d.hasSecondMeter = 'Ні';
        d.meter2Number = '';
        d.meter2Value = '';
        ctx.session.step = 'confirm';
        return ctx.reply(formatMetersConfirmation(d), CONFIRM_KB);
      }

      return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
    }

    if (ctx.session.step === 'meter2Number') {
      if (!isValidMeterNumber(text)) {
        return ctx.reply(
          '❌ Невірний номер лічильника №2.\nМожна вводити букви, цифри, "/" або "-".'
        );
      }
      d.meter2Number = text;
      ctx.session.step = 'meter2Value';
      return ctx.reply('Введіть поточні показники лічильника №2:');
    }

    if (ctx.session.step === 'meter2Value') {
      if (!isValidMeterValue(text)) {
        return ctx.reply(
          '❌ Невірні показники №2.\nВведіть тільки цифри, без букв і знаків.'
        );
      }
      d.meter2Value = text;
      ctx.session.step = 'confirm';
      return ctx.reply(formatMetersConfirmation(d), CONFIRM_KB);
    }

    if (ctx.session.step === 'confirm') {
      if (text === 'Змінити') {
        ctx.session.flow = 'meters';
        ctx.session.step = 'phone';
        ctx.session.data = {};
        return ctx.reply(
          'Добре, почнемо заново.\nВведіть номер телефону у форматі:\n+380XXXXXXXXX або 0XXXXXXXXX',
          REMOVE_KB
        );
      }

      if (text === 'Вірно') {
        if (!canSubmitForm(ctx)) {
          return ctx.reply('⏳ Зачекайте трохи перед повторною відправкою.');
        }

        await appendRow('pokaznyky', [
          new Date().toLocaleString('uk-UA'),
          d.phone || '',
          d.fullName || '',
          d.account || '',
          d.address || '',
          d.meter1Number || '',
          d.meter1Value || '',
          d.hasSecondMeter || '',
          d.meter2Number || '',
          d.meter2Value || '',
          String(ctx.from?.id || ''),
          ctx.from?.username || ''
        ]);

        return sendMainMenu(
          ctx,
          'Дякуємо! Показники приборів обліку водопостачання успішно відправлено до КП «ТЖКП».'
        );
      }

      return ctx.reply('Будь ласка, оберіть: Вірно або Змінити.', CONFIRM_KB);
    }

    return;
  }

  // =====================
  // FLOW: REQUEST
  // =====================
  if (ctx.session.flow === 'request') {
    const d = ctx.session.data;

    if (ctx.session.step === 'phone') {
      const phone = normalizePhone(text);
      if (!phone) {
        return ctx.reply(
          '❌ Невірний номер телефону.\nВведіть український номер у форматі:\n+380XXXXXXXXX або 0XXXXXXXXX'
        );
      }
      d.phone = phone;
      ctx.session.step = 'fullName';
      return ctx.reply('Прізвище, імʼя:');
    }

    if (ctx.session.step === 'fullName') {
      if (!isValidFullName(text)) {
        return ctx.reply(
          '❌ Невірно введено ПІБ.\nВведіть тільки імʼя та прізвище, без цифр і сторонніх символів.'
        );
      }
      d.fullName = text;
      ctx.session.step = 'address';
      return ctx.reply('Адреса (вулиця, будинок, квартира):');
    }

    if (ctx.session.step === 'address') {
      if (!isValidAddress(text)) {
        return ctx.reply(
          '❌ Невірна адреса.\nВведіть повну адресу: вулиця, будинок, квартира.'
        );
      }
      d.address = text;
      ctx.session.step = 'requestText';
      return ctx.reply('Опишіть ваше звернення:');
    }

    if (ctx.session.step === 'requestText') {
      if (!isValidRequestText(text)) {
        return ctx.reply(
          '❌ Звернення введено некоректно.\nОпишіть проблему нормально, від 5 до 500 символів.'
        );
      }

      d.requestText = text;

      if (!canSubmitForm(ctx)) {
        return ctx.reply('⏳ Зачекайте трохи перед повторною відправкою.');
      }

      await appendRow('zayavky', [
        new Date().toLocaleString('uk-UA'),
        d.phone || '',
        d.fullName || '',
        d.address || '',
        d.requestText || '',
        String(ctx.from?.id || ''),
        ctx.from?.username || ''
      ]);

      return sendMainMenu(
        ctx,
        'Дякуємо! Вашу заявку успішно відправлено.'
      );
    }

    return;
  }

  // =====================
  // AUTO-ANSWERS OUTSIDE FORMS
  // =====================
  if (isElectricityRelated(text)) {
    return sendMainMenu(ctx, ELECTRICITY_TEXT);
  }

  if (isPaymentRelated(text)) {
    return sendMainMenu(ctx, PAYMENT_TEXT);
  }

  if (isTariffRelated(text)) {
    return sendMainMenu(ctx, TARIFF_TEXT);
  }

  if (isWaterRelated(text)) {
    return sendMainMenu(ctx, WATER_INFO_TEXT);
  }

  return sendMainMenu(ctx, 'Оберіть, будь ласка, потрібний пункт меню.');
});

// =========================
// LAUNCH
// =========================
bot.launch();
console.log('Бот запущен');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
