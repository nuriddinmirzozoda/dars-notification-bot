const { Telegraf, Markup } = require('telegraf');
const Datastore = require('nedb-promises');
const cron = require('node-cron');
const express = require('express');

// Сервери Express
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Бот фаъол аст!');
});

app.listen(PORT, () => {
  console.log(`Сервер дар порти ${PORT} оғоз шуд`);
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID) || 8928612724; 

const bot = new Telegraf(BOT_TOKEN);

// Канали сарпараст
const SPONSOR_CHANNEL = '@mirzozoda06';

// Базаҳои маълумот
const usersDb = Datastore.create({ filename: './users.db', autoload: true });
const tasksDb = Datastore.create({ filename: './tasks.db', autoload: true });

// Функцияи санҷиши аъзогии канал
async function checkSubscription(userId) {
  try {
    const member = await bot.telegram.getChatMember(SPONSOR_CHANNEL, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (error) {
    console.error('Хатогӣ дар санҷиши канал:', error.message);
    return false;
  }
}

// Фармони /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  let user = await usersDb.findOne({ user_id: userId });
  if (!user) {
    await usersDb.insert({ user_id: userId, notify_time: '09:00' });
  }

  if (userId === ADMIN_ID) {
    ctx.reply(
      `Ассалому алайкум, Админ!\n\n` +
      `/add - Илова кардани супориш\n` +
      `/delete [рақам] - Нест кардани супориш (Масалан: /delete 1)\n` +
      `/list - Рӯйхати супоришҳо`
    );
  } else {
    ctx.reply(
      `Ассалому алайкум! Шумо ба боти огоҳиномаҳои таҳсил пайваст шудед.\n\n` +
      `Шумо метавонед вақти расидани огоҳиномаро бо тугмаи зер интихоб кунед:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⏰ Интихоби вақти огоҳинома', 'set_time')]
      ])
    );
  }
});

// Кнопкаи интихоби вақт (Бо санҷиши обуна)
bot.action('set_time', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    const channelLink = `https://t.me/${SPONSOR_CHANNEL.replace('@', '')}`;
    return ctx.reply(
      `⚠️ **Барои идома додан ва интихоб кардани вақт, аввал ба канали сарпараст обуна шавед!**\n\n` +
      `Пас аз обуна шудан, тугмаи «Интихоби вақти огоҳинома»-ро дар менюи асосӣ дубора пахш кунед.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📢 Обуна шудан ба канал', channelLink)],
          [Markup.button.callback('✅ Санҷидани обуна', 'check_sub')]
        ])
      }
    );
  }

  userState[userId] = { step: 'WAITING_USER_TIME' };
  ctx.reply('Лутфан вақти дилхоҳи худро бо формати HH:MM ворид кунед (масалан: 08:30 ё 19:00):');
});

// Кнопкаи санҷиши такрории обуна
bot.action('check_sub', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const isSubscribed = await checkSubscription(userId);

  if (isSubscribed) {
    userState[userId] = { step: 'WAITING_USER_TIME' };
    await ctx.reply('✅ Ташаккур барои обуна шудан! Инак, вақти дилхоҳи худро бо формати HH:MM ворид кунед (масалан: 08:30):');
  } else {
    await ctx.reply('❌ Шумо ҳанӯз ба канал обуна нашудаед. Лутфан аввал ба канал обуна шавед!');
  }
});

const userState = {};

// Илова кардани супориш аз тарафи Админ
bot.command('add', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ ЭЭЭ ЧОКАДЕСТИ! Шумо ҳуқуқи илова кардани маълумотро надоред!');
  }
  userState[ctx.from.id] = { step: 'WAITING_TITLE' };
  ctx.reply('Номи супориш ё мавзӯъро ворид кунед:\n(Масалан: КМД аз фанни Барномасозӣ)');
});

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  if (!userState[userId]) return next();

  const state = userState[userId];

  // Агар корбар дар ҳоти интихоби вақт бошад, пеш аз ҳама санҷиши обуна мекунем
  if (state.step === 'WAITING_USER_TIME') {
    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
      delete userState[userId];
      const channelLink = `https://t.me/${SPONSOR_CHANNEL.replace('@', '')}`;
      return ctx.reply(
        `⚠️ Интихоби вақт бекор шуд! Шумо ҳанӯз ба канали сарпараст обуна нашудаед.\n\n` +
        `Аввал ба канал обуна шавед, сипас дубора кӯшиш кунед:`,
        Markup.inlineKeyboard([
          [Markup.button.url('📢 Обуна шудан ба канал', channelLink)]
        ])
      );
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const timeText = ctx.message.text.trim();

    if (!timeRegex.test(timeText)) {
      return ctx.reply('Формати вақт нодуруст аст! Лутфан бо формати HH:MM ворид кунед (масалан: 09:30):');
    }

    await usersDb.update({ user_id: userId }, { $set: { notify_time: timeText } });
    delete userState[userId];
    return ctx.reply(`✅ Вақти огоҳиномаҳои шумо ба соати ${timeText} иваз карда шуд!`);
  }

  // Қадамҳои админ барои иловаи супориш
  if (userId !== ADMIN_ID) return next();

  if (state.step === 'WAITING_TITLE') {
    state.title = ctx.message.text;
    state.step = 'WAITING_DATE';
    ctx.reply('Таърихро бо формати YYYY-MM-DD ворид кунед (масалан: 2026-10-15):');
  } 
  else if (state.step === 'WAITING_DATE') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateText = ctx.message.text.trim();

    if (!dateRegex.test(dateText)) {
      return ctx.reply('Формат нодуруст аст! Масалан: 2026-10-15');
    }

    try {
      const taskDateObj = new Date(dateText);
      taskDateObj.setDate(taskDateObj.getDate() - 1);
      const notifyDateStr = taskDateObj.toISOString().split('T')[0];

      await tasksDb.insert({ 
        title: state.title, 
        task_date: dateText,
        notify_date: notifyDateStr
      });

      ctx.reply(
        `✅ Супориш бомуваффақият илова шуд!\n\n` +
        `📌 **Мавзӯъ:** ${state.title}\n` +
        `📅 **Муҳлат:** ${dateText}\n` +
        `(Огоҳинома як рӯз пеш ба ҳар кас дар вақти интихобкардааш мерасад)`
      );
    } catch (err) {
      ctx.reply('Хатогӣ дар нигоҳдории маълумот.');
    }
    delete userState[userId];
  }
});

// Рӯйхати супоришҳо бо рақамҳои пайдарпай
bot.command('list', async (ctx) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = await tasksDb.find({ task_date: { $gte: today } }).sort({ task_date: 1 });

  if (tasks.length === 0) return ctx.reply('Ҳоло ҳеҷ супориши фаъол нест.');

  let message = '📋 **Рӯйхати супоришҳо:**\n\n';
  tasks.forEach((row, index) => {
    message += `🔹 **Рақам: ${index + 1}**\n📌 Мавзӯъ: ${row.title}\n📅 Муҳлат: ${row.task_date}\n\n`;
  });

  if (ctx.from.id !== ADMIN_ID) {
    message += `⚙️ Барои тағйир додани вақти огоҳиномаҳои худ /start -ро пахш кунед.`;
  }

  ctx.reply(message, { parse_mode: 'Markdown' });
});

// Нест кардани супориш аз рӯи рақам
bot.command('delete', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Танҳо админ ҳуқуқи нест кардан дорад.');
  
  const args = ctx.message.text.split(' ');
  const indexToDelete = parseInt(args[1]);

  if (isNaN(indexToDelete)) {
    return ctx.reply('Истифодабарӣ нодуруст аст. Масалан: `/delete 1`', { parse_mode: 'Markdown' });
  }

  const today = new Date().toISOString().split('T')[0];
  const tasks = await tasksDb.find({ task_date: { $gte: today } }).sort({ task_date: 1 });

  if (indexToDelete < 1 || indexToDelete > tasks.length) {
    return ctx.reply('❌ Супориш бо чунин рақам ёфт нашуд. Аввал `/list`-ро санҷед.');
  }

  const taskToRemove = tasks[indexToDelete - 1];
  await tasksDb.remove({ _id: taskToRemove._id }, {});
  
  ctx.reply(`🗑 Супориши № ${indexToDelete} ("${taskToRemove.title}") нест карда шуд.`);
});

// Cron барои фиристодани огоҳиномаҳо дар вақти муайяни корбарон
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;
  const currentDate = now.toISOString().split('T')[0];

  const tasks = await tasksDb.find({ notify_date: currentDate });
  if (tasks.length === 0) return;

  const usersToNotify = await usersDb.find({ notify_time: currentTime });
  if (usersToNotify.length === 0) return;

  let notificationText = `⏰ **ОГОҲИНОМА! ФАРДО МУҲЛАТИ СУПОРИДАН АСТ:**\n\n`;
  tasks.forEach((t) => {
    notificationText += `📌 ${t.title}\n📅 Муҳлат: ${t.task_date}\n\n`;
  });

  usersToNotify.forEach((u) => {
    bot.telegram.sendMessage(u.user_id, notificationText, { parse_mode: 'Markdown' })
      .catch((e) => console.error(e.message));
  });
});

bot.launch().then(async () => {
  console.log('Бот бомуваффақият фаъол шуд!');
  await bot.telegram.setMyCommands([
    { command: 'list', description: '📋 Рӯйхати супоришҳо' },
    { command: 'start', description: '🔄 Оғози бот / Танзими вақт' }
  ]);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
