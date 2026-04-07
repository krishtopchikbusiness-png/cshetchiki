const { Telegraf, Markup, session } = require('telegraf');
const { google } = require('googleapis');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// =========================
// CONFIG
// =========================
const CHANNEL_URL = 'https://t.me/kptgkp';
const CONTACT_CENTER_PHONE = '056 747 36 07';

const MIN_MESSAGE_INTERVAL_MS = 1200;
const MIN_SUBMIT_INTERVAL_MS = 60000;
const MAX_TEXT_LEN = 500;

// =========================
// GOOGLE SHEETS
// =========================
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

async function appendRow(sheetName, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  });
}

// =========================
// DATE / TIME
// =========================
function getDateTimeParts() {
  const now = new Date();

  const date = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  const time = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);

  return { date, time };
}

// =========================
// KEYBOARDS
// =========================
const MAIN_MENU = Markup.keyboard([
  ['📊 Передати показники', '🧾 Залишити заявку'],
  ['📢 Канал ТЖКП', '📞 Контакт центр']
]).resize().persistent();

const CONTACT_KB = Markup.keyboard([
  [Markup.button.contactRequest('📱 Поділитися номером телефону')],
  ['⬅️ В меню']
]).resize().persistent();

const STEP_MENU_KB = Markup.keyboard([
  ['⬅️ В меню']
]).resize().persistent();

const YES_NO = Markup.keyboard([
  ['Так', 'Ні'],
  ['⬅️ В меню']
]).resize().persistent();

const CONFIRM_KB = Markup.keyboard([
  ['Вірно', 'Змінити'],
  ['⬅️ В меню']
]).resize().persistent();

// =========================
// TEXTS FROM TZ
// =========================
const START_TEXT =
  'Вас вітає віртуальний помічник КП «ТЖКП»! 👋\n\n' +
  'За моєю допомогою ви можете передати показники приладів обліку, оформити заявку або отримати актуальну інформацію.';

const SUCCESS_METERS_TEXT =
  'Дякуємо! Показники приборів обліку водопостачання успішно відправлено до КП «ТЖКП».';

const SUCCESS_REQUEST_TEXT =
  'Дякуємо! Вашу заявку успішно відправлено.';

const WATER_INFO_TEXT =
  'Актуальну інформацію щодо аварійних ситуацій, ремонтних робіт, відключень або відновлення послуг, а також руху транспорту ви можете переглянути в офіційному Telegram-каналі КП «ТЖКП»:\n\n' +
  'https://t.me/kptgkp';

const ELECTRICITY_TEXT =
  'КП «ТЖКП» не є постачальником або виробником електричної енергії, тому з цього питання рекомендуємо звернутися до вашого постачальника електроенергії, з яким у вас укладено договір (наприклад, це може бути ДТЕК або ЦЕК).\n\n' +
  'Також рекомендуємо слідкувати за графіками відключень електроенергії та інформацією про проведення ремонтних робіт на офіційних ресурсах енергетичних компаній.\n\n' +
  'Комунальне підприємство «Тернівське житлово-комунальне підприємство» не надає послуги постачання електричної енергії.';

const PAYMENT_TEXT =
  'Онлайн-оплата:\n' +
  'Ви можете здійснити оплату онлайн за посиланням:\n' +
  'https://tgkp.com.ua/pay/#top\n\n' +
  'Фізична оплата:\n' +
  'Також оплату можна здійснити особисто за адресою:\n' +
  'м. Тернівка, вул. Григорія Сковороди, 11\n\n' +
  'Графік роботи:\n' +
  'Понеділок – четвер з 8:00 до 16:30, пʼятниця з 8:00 до 16:00 (без перерви)\n\n' +
  'Графік роботи абонентського відділу:\n' +
  'Абонентський відділ: понеділок – четвер з 8:00 до 17:00 (перерва з 12:00 до 13:00)\n\n';

const TARIFF_TEXT =
  'Актуальні тарифи КП «ТЖКП» ви можете переглянути на офіційному сайті:\nhttps://tgkp.com.ua/tariff/';

// =========================
// HELPERS
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

async function showMainMenu(ctx, text = START_TEXT) {
  resetSession(ctx);
  return ctx.reply(text, MAIN_MENU);
}

function normalizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/ґ/g, 'г')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, phrases) {
  const t = normalizeIntentText(text);
  return phrases.some(p => t.includes(normalizeIntentText(p)));
}

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
  return String(input || '').trim().length > 0;
}

function isValidAddress(input) {
  const v = String(input || '').trim();
  if (v.length < 5 || v.length > 120) return false;
  return !/^[^A-Za-zА-Яа-яІіЇїЄєҐґЁё0-9]+$/.test(v);
}

function isValidMeterNumber(input) {
  return String(input || '').trim().length > 0;
}

function isValidMeterValue(input) {
  return /^\d{1,10}$/.test(String(input || '').trim());
}

function isValidRequestText(input) {
  return String(input || '').trim().length > 0;
}

function isGarbageText(input) {
  const v = String(input || '').trim();
  return !v;
}

function canProcessMessage(ctx) {
  ensureSession(ctx);
  const now = Date.now();
  if (now - ctx.session.lastMessageAt < MIN_MESSAGE_INTERVAL_MS) return false;
  ctx.session.lastMessageAt = now;
  return true;
}

function canSubmitForm(ctx) {
  ensureSession(ctx);
  const now = Date.now();
  if (now - ctx.session.lastSubmitAt < MIN_SUBMIT_INTERVAL_MS) return false;
  ctx.session.lastSubmitAt = now;
  return true;
}

function formatMetersConfirm(d) {
  return (
    'Перевірте введені дані:\n\n' +
    `Телефон: ${d.phone || '-'}\n` +
    `Прізвище, імʼя: ${d.fullName || '-'}\n` +
    `Особистий рахунок: ${d.account || '-'}\n` +
    `Адреса: ${d.address || '-'}\n` +
    `Лічильник №1: ${d.meter1Number || '-'}\n` +
    `Показники №1: ${d.meter1Value || '-'}\n` +
    `Другий лічильник: ${d.hasSecondMeter || '-'}\n` +
    `Лічильник №2: ${d.meter2Number || '-'}\n` +
    `Показники №2: ${d.meter2Value || '-'}`
  );
}

function formatRequestConfirm(d) {
  return (
    'Перевірте введені дані:\n\n' +
    `Телефон: ${d.phone || '-'}\n` +
    `Прізвище, імʼя: ${d.fullName || '-'}\n` +
    `Адреса: ${d.address || '-'}\n` +
    `Звернення: ${d.requestText || '-'}`
  );
}

// =========================
// OFFICIAL TRIGGERS RU + UA
// =========================
function isWaterRelated(text) {
  return includesAny(text, [
    'аварія',
    'аварійні роботи',
    'ремонт',
    'ремонтні роботи',
    'немає води',
    'відсутність води',
    'відсутність водопостачання',
    'немає тепла',
    'відсутність теплопостачання',
    'відновлення водопостачання',
    'відновлення теплопостачання',
    'обмеження водопостачання',
    'графік руху маршрутного автобуса',
    'відсутність автобуса',
    'автобус',
    'маршрут',
    'вода',
    'тепло',
    'коли дадуть воду',
    'коли буде вода',
    'чому немає води',

    'авария',
    'аварийные работы',
    'ремонтные работы',
    'нет воды',
    'отсутствие воды',
    'отсутствие водоснабжения',
    'нет отопления',
    'отсутствие отопления',
    'восстановление водоснабжения',
    'восстановление отопления',
    'ограничение водоснабжения',
    'маршрутный автобус',
    'нет автобуса',
    'вода',
    'отопление',
    'почему нету воды',
    'где вода'
    'когда дадут воду',
    'почему нет воды'
  ]);
}

function isElectricityRelated(text) {
  return includesAny(text, [
    'немає світла',
    'відключили світло',
    'чому немає електрики',
    'коли дадуть світло',
    'проблеми з електропостачанням',
    'електроенергія',
    'електрика',
    'світло',

    'нет света',
    'отключили свет',
    'почему нет электричества',
    'когда дадут свет',
    'проблемы с электроснабжением',
    'электричество',
    'свет'
  ]);
}

function isPaymentRelated(text) {
  return includesAny(text, [
    'оплатити',
    'платить',
    'оплата',
    'заплатити',
    'платіж',
    'де оплатити',
    'як оплатити',
    'як внести оплату',

    'оплатить',
    'оплата',
    'заплатить',
    'платеж',
    'где оплатить',
    'как оплатить',
    'как внести оплату',

    'pay',
    'payment',
    'invoice'
  ]);
}

function isTariffRelated(text) {
  return includesAny(text, [
    'тариф',
    'цена за воду',
    'тарифи',
    'вартість послуг',
    'ціни на воду',
    'ціни на тепло',
    'вивіз сміття',
    'абонплата',
    'скільки коштує',

    'тариф',
    'тарифы',
    'стоимость услуг',
    'цены на воду',
    'цены на тепло',
    'вывоз мусора',
    'абонплата',
    'сколько стоит'
  ]);
}

// =========================
// START / MAIN MENU
// =========================
bot.start(async (ctx) => {
  await showMainMenu(ctx);
});

bot.hears('⬅️ В меню', async (ctx) => {
  return showMainMenu(ctx);
});

bot.hears('📢 Канал ТЖКП', async (ctx) => {
  return ctx.reply(
    'Офіційний Telegram-канал КП «ТЖКП»:\n\nhttps://t.me/kptgkp',
    MAIN_MENU
  );
});

bot.hears('📞 Контакт центр', async (ctx) => {
  return ctx.reply(`Контакт центр: ${CONTACT_CENTER_PHONE}`, MAIN_MENU);
});

// =========================
// START FORM: METERS
// =========================
bot.hears('📊 Передати показники', async (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'meters';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  return ctx.reply(
    'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
    CONTACT_KB
  );
});

// =========================
// START FORM: REQUEST
// =========================
bot.hears('🧾 Залишити заявку', async (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'request';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  return ctx.reply(
    'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
    CONTACT_KB
  );
});

// =========================
// CONTACT HANDLER
// =========================
bot.on('contact', async (ctx) => {
  ensureSession(ctx);

  if (!ctx.session.flow || ctx.session.step !== 'phone') {
    return ctx.reply('Оберіть, будь ласка, потрібний пункт меню або задайте ваше запитання.', MAIN_MENU);
  }

  let phone = String(ctx.message.contact.phone_number || '').trim();
  phone = normalizePhone(phone);

  if (!phone) {
    return ctx.reply(
      '❌ Невірний номер телефону. Будь ласка, скористайтеся кнопкою ще раз.',
      CONTACT_KB
    );
  }

  ctx.session.data.phone = phone;
  ctx.session.step = 'fullName';

  return ctx.reply('Прізвище, імʼя:', STEP_MENU_KB);
});

// =========================
// MAIN TEXT HANDLER
// =========================
bot.on('text', async (ctx) => {
  ensureSession(ctx);

  try {
    if (!canProcessMessage(ctx)) return;

    const text = (ctx.message.text || '').trim();

    if (text === '⬅️ В меню') {
      return showMainMenu(ctx);
    }

    if (
      text === '📊 Передати показники' ||
      text === '🧾 Залишити заявку' ||
      text === '📢 Канал ТЖКП' ||
      text === '📞 Контакт центр'
    ) {
      return;
    }

    if (isGarbageText(text)) {
      return ctx.reply('❌ Некоректне повідомлення. Введіть нормальні дані.', STEP_MENU_KB);
    }

    // =====================
    // METERS FLOW
    // =====================
    if (ctx.session.flow === 'meters') {
      const d = ctx.session.data;

      if (ctx.session.step === 'phone') {
        return ctx.reply(
          'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
          CONTACT_KB
        );
      }

      if (ctx.session.step === 'fullName') {
        if (!isValidFullName(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірно введено ПІБ.\nВведіть тільки імʼя та прізвище, без цифр і сторонніх символів.',
            STEP_MENU_KB
          );
        }

        d.fullName = text;
        ctx.session.step = 'account';
        return ctx.reply('Особистий рахунок:', STEP_MENU_KB);
      }

      if (ctx.session.step === 'account') {
        if (!isValidAccount(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть особистий рахунок:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть особистий рахунок:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть особистий рахунок:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть особистий рахунок:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Введіть особистий рахунок.',
            STEP_MENU_KB
          );
        }

        d.account = text;
        ctx.session.step = 'address';
        return ctx.reply('Адреса (вулиця, будинок, квартира):', STEP_MENU_KB);
      }

      if (ctx.session.step === 'address') {
        if (!isValidAddress(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірна адреса.\nВведіть повну адресу: вулиця, будинок, квартира.',
            STEP_MENU_KB
          );
        }

        d.address = text;
        ctx.session.step = 'meter1Number';
        return ctx.reply('Вкажіть номер лічильника №1:', STEP_MENU_KB);
      }

      if (ctx.session.step === 'meter1Number') {
        if (!isValidMeterNumber(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №1:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №1:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №1:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №1:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Введіть номер лічильника.',
            STEP_MENU_KB
          );
        }

        d.meter1Number = text;
        ctx.session.step = 'meter1Value';
        return ctx.reply('Введіть поточні показники лічильника №1:', STEP_MENU_KB);
      }

      if (ctx.session.step === 'meter1Value') {
        if (!isValidMeterValue(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №1:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №1:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №1:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №1:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірні показники.\nВведіть тільки цифри, без букв і знаків.',
            STEP_MENU_KB
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
          return ctx.reply('Вкажіть номер лічильника №2:', STEP_MENU_KB);
        }

        if (text === 'Ні') {
          d.hasSecondMeter = 'Ні';
          d.meter2Number = '';
          d.meter2Value = '';
          ctx.session.step = 'confirm';
          return ctx.reply(formatMetersConfirm(d), CONFIRM_KB);
        }

        if (isWaterRelated(text)) {
          await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
          return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
        }
        if (isElectricityRelated(text)) {
          await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
          return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
        }
        if (isPaymentRelated(text)) {
          await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
          return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
        }
        if (isTariffRelated(text)) {
          await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
          return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
        }

        return ctx.reply('Будь ласка, оберіть: Так або Ні.', YES_NO);
      }

      if (ctx.session.step === 'meter2Number') {
        if (!isValidMeterNumber(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №2:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №2:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №2:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, вкажіть номер лічильника №2:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Введіть номер лічильника №2.',
            STEP_MENU_KB
          );
        }

        d.meter2Number = text;
        ctx.session.step = 'meter2Value';
        return ctx.reply('Введіть поточні показники лічильника №2:', STEP_MENU_KB);
      }

      if (ctx.session.step === 'meter2Value') {
        if (!isValidMeterValue(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №2:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №2:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №2:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть поточні показники лічильника №2:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірні показники №2.\nВведіть тільки цифри, без букв і знаків.',
            STEP_MENU_KB
          );
        }

        d.meter2Value = text;
        ctx.session.step = 'confirm';
        return ctx.reply(formatMetersConfirm(d), CONFIRM_KB);
      }

      if (ctx.session.step === 'confirm') {
        if (text === 'Змінити') {
          ctx.session.flow = 'meters';
          ctx.session.step = 'phone';
          ctx.session.data = {};
          return ctx.reply(
            'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
            CONTACT_KB
          );
        }

        if (text === 'Вірно') {
          if (!canSubmitForm(ctx)) {
            return ctx.reply('⏳ Зачекайте трохи перед повторною відправкою.', CONFIRM_KB);
          }

          const { date, time } = getDateTimeParts();

          await appendRow('Показники', [
            date,
            time,
            d.phone || '',
            d.fullName || '',
            d.account || '',
            d.address || '',
            d.meter1Number || '',
            d.meter1Value || '',
            d.hasSecondMeter || '',
            d.meter2Number || '',
            d.meter2Value || ''
          ]);

          return showMainMenu(ctx, SUCCESS_METERS_TEXT);
        }

        return ctx.reply('Будь ласка, оберіть: Вірно або Змінити.', CONFIRM_KB);
      }

      return;
    }

    // =====================
    // REQUEST FLOW
    // =====================
    if (ctx.session.flow === 'request') {
      const d = ctx.session.data;

      if (ctx.session.step === 'phone') {
        return ctx.reply(
          'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
          CONTACT_KB
        );
      }

      if (ctx.session.step === 'fullName') {
        if (!isValidFullName(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть прізвище, імʼя:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірно введено ПІБ.\nВведіть тільки імʼя та прізвище, без цифр і сторонніх символів.',
            STEP_MENU_KB
          );
        }

        d.fullName = text;
        ctx.session.step = 'address';
        return ctx.reply('Адреса (вулиця, будинок, квартира):', STEP_MENU_KB);
      }

      if (ctx.session.step === 'address') {
        if (!isValidAddress(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, введіть адресу (вулиця, будинок, квартира):', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Невірна адреса.\nВведіть повну адресу: вулиця, будинок, квартира.',
            STEP_MENU_KB
          );
        }

        d.address = text;
        ctx.session.step = 'requestText';
        return ctx.reply('Опишіть ваше звернення:', STEP_MENU_KB);
      }

      if (ctx.session.step === 'requestText') {
        if (!isValidRequestText(text)) {
          if (isWaterRelated(text)) {
            await ctx.reply(WATER_INFO_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, опишіть ваше звернення:', STEP_MENU_KB);
          }
          if (isElectricityRelated(text)) {
            await ctx.reply(ELECTRICITY_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, опишіть ваше звернення:', STEP_MENU_KB);
          }
          if (isPaymentRelated(text)) {
            await ctx.reply(PAYMENT_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, опишіть ваше звернення:', STEP_MENU_KB);
          }
          if (isTariffRelated(text)) {
            await ctx.reply(TARIFF_TEXT, STEP_MENU_KB);
            return ctx.reply('Будь ласка, опишіть ваше звернення:', STEP_MENU_KB);
          }

          return ctx.reply(
            '❌ Опишіть ваше звернення.',
            STEP_MENU_KB
          );
        }

        d.requestText = text;
        ctx.session.step = 'confirmRequest';
        return ctx.reply(formatRequestConfirm(d), CONFIRM_KB);
      }

      if (ctx.session.step === 'confirmRequest') {
        if (text === 'Змінити') {
          ctx.session.flow = 'request';
          ctx.session.step = 'phone';
          ctx.session.data = {};
          return ctx.reply(
            'Будь ласка, натисніть кнопку нижче, щоб поділитися номером телефону:',
            CONTACT_KB
          );
        }

        if (text === 'Вірно') {
          if (!canSubmitForm(ctx)) {
            return ctx.reply('⏳ Зачекайте трохи перед повторною відправкою.', CONFIRM_KB);
          }

          const { date, time } = getDateTimeParts();

          await appendRow('Заявки', [
            date,
            time,
            d.phone || '',
            d.fullName || '',
            d.address || '',
            d.requestText || ''
          ]);

          return showMainMenu(ctx, SUCCESS_REQUEST_TEXT);
        }

        return ctx.reply('Будь ласка, оберіть: Вірно або Змінити.', CONFIRM_KB);
      }

      return;
    }

    // =====================
    // OFFICIAL ANSWERS OUTSIDE FORMS
    // =====================
    if (isElectricityRelated(text)) {
      return showMainMenu(ctx, ELECTRICITY_TEXT);
    }

    if (isPaymentRelated(text)) {
      return showMainMenu(ctx, PAYMENT_TEXT);
    }

    if (isTariffRelated(text)) {
      return showMainMenu(ctx, TARIFF_TEXT);
    }

    if (isWaterRelated(text)) {
      return showMainMenu(ctx, WATER_INFO_TEXT);
    }

    return showMainMenu(ctx, 'Оберіть, будь ласка, потрібний пункт меню або задайте ваше запитання.');
  } catch (error) {
    console.error('FULL ERROR:', error?.response?.data || error?.message || error);

    return ctx.reply(
      `❌ Помилка запису: ${
        error?.response?.data?.error?.message ||
        error?.message ||
        'невідома помилка'
      }`,
      MAIN_MENU
    );
  }
});

// =========================
// LAUNCH
// =========================
bot.launch();
console.log('Бот запущен');

