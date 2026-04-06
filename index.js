const { Telegraf, Markup, session } = require('telegraf');
const { google } = require('googleapis');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ===== GOOGLE SHEETS =====
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

async function saveToSheet(sheetName, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values]
    }
  });
}

// ===== МЕНЮ =====
function mainMenu(ctx) {
  return ctx.reply(
    'Вас вітає віртуальний помічник КП «ТЖКП»! 👋',
    Markup.keyboard([
      ['📊 Передати показники'],
      ['🧾 Залишити заявку'],
      ['📢 Канал ТЖКП'],
      ['📞 Контакт центр']
    ]).resize()
  );
}

bot.start(mainMenu);

// ===== ПРОСТЫЕ КНОПКИ =====
bot.hears('📢 Канал ТЖКП', (ctx) => ctx.reply('https://t.me/kptgkp'));
bot.hears('📞 Контакт центр', (ctx) => ctx.reply('📞 Контакт центр: 056 747 36 07'));

// ===== АВТО-ОТВЕТЫ (СТРОГО ПО ТЗ) =====
bot.on('text', (ctx, next) => {
  const t = ctx.message.text.toLowerCase();

  if (t.includes('авар') || t.includes('ремонт') || t.includes('вода') || t.includes('тепло') || t.includes('автобус')) {
    return ctx.reply(`Актуальну інформацію щодо аварійних ситуацій, ремонтних робіт, відключень або відновлення послуг, а також руху транспорту ви можете переглянути в офіційному Telegram-каналі КП «ТЖКП»:

https://t.me/kptgkp`);
  }

  if (t.includes('світло') || t.includes('електро')) {
    return ctx.reply(`КП «ТЖКП» не є постачальником або виробником електричної енергії, тому з цього питання рекомендуємо звернутися до вашого постачальника електроенергії, з яким у вас укладено договір (наприклад, це може бути ДТЕК або ЦЕК).

Також рекомендуємо слідкувати за графіками відключень електроенергії та інформацією про проведення ремонтних робіт на офіційних ресурсах енергетичних компаній.

Комунальне підприємство «Тернівське житлово-комунальне підприємство» не надає послуги постачання електричної енергії.`);
  }

  if (t.includes('оплат') || t.includes('pay')) {
    return ctx.reply(`(1) Онлайн-оплата:
https://tgkp.com.ua/pay/#top

(2) Фізична оплата:
м. Тернівка, вул. Григорія Сковороди, 11

(3) Графік роботи:
Понеділок – четвер з 8:00 до 16:30, пʼятниця з 8:00 до 16:00 (без перерви)

(4) Графік роботи абонентського відділу:
Абонентський відділ: понеділок – четвер з 8:00 до 17:00 (перерва з 12:00 до 13:00)

(5) Завершення:
Якщо у вас виникнуть запитання — із задоволенням допоможу!`);
  }

  next();
});

// ===== ПЕРЕДАТЬ ПОКАЗНИКИ =====
bot.hears('📊 Передати показники', (ctx) => {
  ctx.session = { step: 'p_phone', data: {} };
  ctx.reply('Введіть номер телефону:');
});

bot.hears('🧾 Залишити заявку', (ctx) => {
  ctx.session = { step: 'z_phone', data: {} };
  ctx.reply('Введіть телефон:');
});

bot.on('text', async (ctx) => {
  if (!ctx.session) return;

  const step = ctx.session.step;
  const text = ctx.message.text;

  // ===== ПОКАЗНИКИ =====
  if (step.startsWith('p_')) {
    const d = ctx.session.data;

    switch (step) {
      case 'p_phone':
        d.phone = text;
        ctx.session.step = 'p_name';
        return ctx.reply('ПІБ:');

      case 'p_name':
        d.name = text;
        ctx.session.step = 'p_account';
        return ctx.reply('Особистий рахунок:');

      case 'p_account':
        d.account = text;
        ctx.session.step = 'p_address';
        return ctx.reply('Адреса:');

      case 'p_address':
        d.address = text;
        ctx.session.step = 'p_m1';
        return ctx.reply('Номер лічильника №1:');

      case 'p_m1':
        d.m1 = text;
        ctx.session.step = 'p_v1';
        return ctx.reply('Показники №1:');

      case 'p_v1':
        d.v1 = text;
        ctx.session.step = 'p_has2';
        return ctx.reply('Є другий лічильник?', Markup.keyboard([['Так'], ['Ні']]).resize());

      case 'p_has2':
        if (text === 'Так') {
          ctx.session.step = 'p_m2';
          return ctx.reply('Номер лічильника №2:');
        } else {
          ctx.session.step = 'p_confirm';
          return confirm(ctx);
        }

      case 'p_m2':
        d.m2 = text;
        ctx.session.step = 'p_v2';
        return ctx.reply('Показники №2:');

      case 'p_v2':
        d.v2 = text;
        ctx.session.step = 'p_confirm';
        return confirm(ctx);

      case 'p_confirm':
        if (text === 'Вірно') {
          await saveToSheet('pokaznyky', [
            new Date().toLocaleString(),
            d.phone, d.name, d.account, d.address,
            d.m1, d.v1, d.m2 || '', d.v2 || ''
          ]);
          ctx.session = null;
          mainMenu(ctx);
          return ctx.reply('Дякуємо! Показники передано ✅');
        } else {
          ctx.session = null;
          return ctx.reply('Почнемо заново');
        }
    }
  }

  // ===== ЗАЯВКА =====
  if (step.startsWith('z_')) {
    const d = ctx.session.data;

    switch (step) {
      case 'z_phone':
        d.phone = text;
        ctx.session.step = 'z_name';
        return ctx.reply('ПІБ:');

      case 'z_name':
        d.name = text;
        ctx.session.step = 'z_address';
        return ctx.reply('Адреса:');

      case 'z_address':
        d.address = text;
        ctx.session.step = 'z_text';
        return ctx.reply('Опишіть звернення:');

      case 'z_text':
        d.text = text;

        await saveToSheet('zayavky', [
          new Date().toLocaleString(),
          d.phone, d.name, d.address, d.text
        ]);

        ctx.session = null;
        mainMenu(ctx);
        return ctx.reply('Заявку відправлено ✅');
    }
  }
});

// ===== ПОДТВЕРЖДЕНИЕ =====
function confirm(ctx) {
  const d = ctx.session.data;
  return ctx.reply(
    `Перевірте дані:

Телефон: ${d.phone}
ПІБ: ${d.name}
Рахунок: ${d.account}
Адреса: ${d.address}
Ліч1: ${d.m1} (${d.v1})
Ліч2: ${d.m2 || '-'} (${d.v2 || '-'})`,
    Markup.keyboard([['Вірно'], ['Змінити']]).resize()
  );
}

bot.launch();
