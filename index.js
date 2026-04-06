const { Telegraf, Markup } = require('telegraf')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => {
  ctx.reply(
    'Меню 👇',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 Заявка', 'zayavka'),
        Markup.button.callback('🔧 Звернення', 'zvernennia')
      ],
      [
        Markup.button.url('📢 Канал', 'https://t.me/your_channel'),
        Markup.button.url('📞 Позвонить', 'tel:+380XXXXXXXXX')
      ]
    ])
  )
})

bot.action('zayavka', (ctx) => {
  ctx.reply('Вы выбрали заявку')
})

bot.action('zvernennia', (ctx) => {
  ctx.reply('Вы выбрали звернення')
})

bot.launch()

console.log('Бот запущен')
