const { Telegraf, Markup, session } = require('telegraf');
const { google } = require('googleapis');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

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
// КЛАВИАТУРЫ
// =========================
const MAIN_MENU = Markup.keyboard([
  ['📊 Передати показники'],
  ['🧾 Залишити заявку'],
  ['📢 Канал ТЖКП'],
  ['📞 Контакт центр']
]).resize();

const YES_NO = Markup.keyboard([['Так', 'Ні']]).resize();

const CONFIRM_KB = Markup.keyboard([['Вірно', 'Змінити']]).resize();

// =========================
// ТЕКСТЫ ПО ТЗ
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
  'Актуальні тарифи КП «ТЖКП» ви можете переглянути на офіційному сайті:\n' +
  'https://tgkp.com.ua/tariff/';

// =========================
// ВСПОМОГАТЕЛЬНОЕ
// =========================
function resetSession(ctx) {
  ctx.session = {
    flow: null,
    step: null,
    data: {}
  };
}

function ensureSession(ctx) {
  if (!ctx.session) resetSession(ctx);
  if (!ctx.session.data) ctx.session.data = {};
}

function showMainMenu(ctx, text = START_TEXT) {
  resetSession(ctx);
  return ctx.reply(text, MAIN_MENU);
}

function formatMetersConfirmation(d) {
  return (
    'Перевірте дані:\n\n' +
    `Телефон: ${d.phone || '-'}\n` +
    `ПІБ: ${d.fullName || '-'}\n` +
    `Рахунок: ${d.account || '-'}\n` +
    `Адреса: ${d.address || '-'}\n` +
    `Ліч1: ${d.meter1Number || '-'} (${d.meter1Value || '-'})\n` +
    `Ліч2: ${d.meter2Number || '-'} (${d.meter2Value || '-'})`
  );
}

function isWaterRelated(text) {
  const t = text.toLowerCase();
  return [
    'авар',
    'ремонт',
    'вод',
    'тепл',
    'відновлення вод',
    'відновлення тепл',
    'обмеження вод',
    'автобус',
    'маршрут',
    'відсутність автобуса'
  ].some(k => t.includes(k));
}

function isElectricityRelated(text) {
  const t = text.toLowerCase();
  return [
    'немає світла',
    'відключили світло',
    'немає електрики',
    'коли дадуть світло',
    'електро',
    'електропостач'
  ].some(k => t.includes(k));
}

function isPaymentRelated(text) {
  const t = text.toLowerCase();
  return [
    'оплат',
    'заплат',
    'платіж',
    'де оплатити',
    'як оплатити',
    'як внести оплату',
    'pay',
    'payment',
    'invoice'
  ].some(k => t.includes(k));
}

function isTariffRelated(text) {
  const t = text.toLowerCase();
  return [
    'тариф',
    'вартість',
    'ціни',
    'ціна',
    'вода скільки',
    'тепло скільки',
    'абонплат'
  ].some(k => t.includes(k));
}

// =========================
// START / MENU
// =========================
bot.start((ctx) => showMainMenu(ctx));

bot.hears('📢 Канал ТЖКП', (ctx) => {
  resetSession(ctx);
  return ctx.reply('https://t.me/kptgkp', MAIN_MENU);
});

bot.hears('📞 Контакт центр', (ctx) => {
  resetSession(ctx);
  return ctx.reply('Контакт центр: 056 747 36 07', MAIN_MENU);
});

// =========================
// ПЕРЕДАТИ ПОКАЗНИКИ
// =========================
bot.hears('📊 Передати показники', (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'meters';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  return ctx.reply('Введіть номер телефону:', MAIN_MENU);
});

// =========================
// ЗАЛИШИТИ ЗАЯВКУ
// =========================
bot.hears('🧾 Залишити заявку', (ctx) => {
  ensureSession(ctx);
  ctx.session.flow = 'request';
  ctx.session.step = 'phone';
  ctx.session.data = {};
  return ctx.reply('Вкажіть ваш телефон:', MAIN_MENU);
});

// =========================
// ОБЩИЙ ОБРАБОТЧИК
// =========================
bot.on('text', async (ctx) => {
  ensureSession(ctx);
  const text = (ctx.message.text || '').trim();

  if (text === '/start') {
    return showMainMenu(ctx);
  }

  // Не перехватываем кнопки меню тут повторно
  if (
    text === '📊 Передати показники' ||
    text === '🧾 Залишити заявку' ||
    text === '📢 Канал ТЖКП' ||
    text === '📞 Контакт центр'
  ) {
    return;
  }

  // ===== FLOW: METERS =====
  if (ctx.session.flow === 'meters') {
    const d = ctx.session.data;

    if (ctx.session.step === 'phone') {
      d.phone = text;
      ctx.session.step = 'fullName';
      return ctx.reply('Прізвище, імʼя:');
    }

    if (ctx.session.step === 'fullName') {
      d.fullName = text;
      ctx.session.step = 'account';
      return ctx.reply('Особистий рахунок:');
    }

    if (ctx.session.step === 'account') {
      d.account = text;
      ctx.session.step = 'address';
      return ctx.reply('Адреса (вулиця, будинок, квартира):');
    }

    if (ctx.session.step === 'address') {
      d.address = text;
      ctx.session.step = 'meter1Number';
      return ctx.reply('Вкажіть номер лічильника №1:');
    }

    if (ctx.session.step === 'meter1Number') {
      d.meter1Number = text;
      ctx.session.step = 'meter1Value';
      return ctx.reply('Введіть поточні показники лічильника №1:');
    }

    if (ctx.session.step === 'meter1Value') {
      d.meter1Value = text;
      ctx.session.step = 'hasSecondMeter';
      return ctx.reply('Чи є у вас другий лічильник?', YES_NO);
    }

    if (ctx.session.step === 'hasSecondMeter') {
      if (text === 'Так') {
        d.hasSecondMeter = 'Так';
        ctx.session.step = 'meter2Number';
        return ctx.reply('Вкажіть номер лічильника №2:');
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
      d.meter2Number = text;
      ctx.session.step = 'meter2Value';
      return ctx.reply('Введіть поточні показники лічильника №2:');
    }

    if (ctx.session.step === 'meter2Value') {
      d.meter2Value = text;
      ctx.session.step = 'confirm';
      return ctx.reply(formatMetersConfirmation(d), CONFIRM_KB);
    }

    if (ctx.session.step === 'confirm') {
      if (text === 'Змінити') {
        ctx.session.flow = 'meters';
        ctx.session.step = 'phone';
        ctx.session.data = {};
        return ctx.reply('Добре, введіть номер телефону заново:', MAIN_MENU);
      }

      if (text === 'Вірно') {
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
          d.meter2Value || ''
        ]);

        resetSession(ctx);
        await ctx.reply(
          'Дякуємо! Показники приборів обліку водопостачання успішно відправлено до КП «ТЖКП».',
          MAIN_MENU
        );
        return;
      }

      return ctx.reply('Будь ласка, оберіть: Вірно або Змінити.', CONFIRM_KB);
    }

    return;
  }

  // ===== FLOW: REQUEST =====
  if (ctx.session.flow === 'request') {
    const d = ctx.session.data;

    if (ctx.session.step === 'phone') {
      d.phone = text;
      ctx.session.step = 'fullName';
      return ctx.reply('Прізвище, імʼя:');
    }

    if (ctx.session.step === 'fullName') {
      d.fullName = text;
      ctx.session.step = 'address';
      return ctx.reply('Адреса (вулиця, будинок, квартира):');
    }

    if (ctx.session.step === 'address') {
      d.address = text;
      ctx.session.step = 'requestText';
      return ctx.reply('Опишіть ваше звернення:');
    }

    if (ctx.session.step === 'requestText') {
      d.requestText = text;

      await appendRow('zayavky', [
        new Date().toLocaleString('uk-UA'),
        d.phone || '',
        d.fullName || '',
        d.address || '',
        d.requestText || ''
      ]);

      resetSession(ctx);
      await ctx.reply('Дякуємо! Вашу заявку успішно відправлено.', MAIN_MENU);
      return;
    }

    return;
  }

  // ===== АВТО-ОТВЕТЫ ПО ТЗ =====
  if (isElectricityRelated(text)) {
    return ctx.reply(ELECTRICITY_TEXT, MAIN_MENU);
  }

  if (isPaymentRelated(text)) {
    return ctx.reply(PAYMENT_TEXT, MAIN_MENU);
  }

  if (isTariffRelated(text)) {
    return ctx.reply(TARIFF_TEXT, MAIN_MENU);
  }

  if (isWaterRelated(text)) {
    return ctx.reply(WATER_INFO_TEXT, MAIN_MENU);
  }

  // ===== ИНАЧЕ =====
  return ctx.reply(
    'Оберіть, будь ласка, потрібний пункт меню.',
    MAIN_MENU
  );
});

// =========================
// LAUNCH
// =========================
bot.launch();
console.log('Bot started');

// Корректное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
