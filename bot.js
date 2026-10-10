const { Telegraf } = require('telegraf');
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

// 🔒 Истифодаи Token ва ID тавассути Environment Variables (Бехатар)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID) || 8928612724; 

const bot = new Telegraf(BOT_TOKEN);

// Сохтани базаҳои маълумоти JSON
const usersDb = Datastore.create({ filename: './users.db', autoload: true });
const tasksDb = Datastore.create({ filename: './tasks.db', autoload: true });

// Фармони /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  const userExists = await usersDb.findOne({ user_id: userId });
  if (!userExists) {
    await usersDb.insert({ user_id: userId });
  }

  if (userId === ADMIN_ID) {
    ctx.reply(
      `Ассалому алайкум, Админ!\n\n` +
      `/add - Илова кардани супориш\n` +
      `/delete - Нест кардани супориш\n` +
      `/list - Рӯйхати супоришҳо`
    );
  } else {
    ctx.reply(
      `Ассалому алайкум! Шумо ба боти огоҳиномаҳои таҳсил пайваст шудед.\n` +
      `Ба шумо 1 рӯз пеш аз муҳлат огоҳинома мерасад.\n\n` +
      `/list - Рӯйхати супоришҳо`
    );
  }
});

const userState = {};

// Илова кардани супориш (Танҳо барои Админ)
bot.command('add', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ Шумо ҳуқуқи илова кардани маълумотро надоред!');
  }
  userState[ctx.from.id] = { step: 'WAITING_TITLE' };
  ctx.reply('Номи супориш ё мавзӯъро ворид кунед:\n(Масалан: КМД аз фанни Барномасозӣ)');
});

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  if (userId !== ADMIN_ID || !userState[userId]) return next();

  const state = userState[userId];

  if (state.step === 'WAITING_TITLE') {
    state.title = ctx.message.text;
    state.step = 'WAITING_DATE';
    ctx.reply('Таърихро бо формати YYYY-MM-DD ворид кунед (масалан: 2026-10-15):');
  } else if (state.step === 'WAITING_DATE') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateText = ctx.message.text.trim();

    if (!dateRegex.test(dateText)) {
      return ctx.reply('Формат нодуруст аст! Масалан: 2026-10-15');
    }

    try {
      await tasksDb.insert({ title: state.title, task_date: dateText });
      ctx.reply(`✅ Супориш илова шуд!\n\n📌 **Мавзӯъ:** ${state.title}\n📅 **Муҳлат:** ${dateText}`);
    } catch (err) {
      ctx.reply('Хатогӣ дар нигоҳдорӣ.');
    }
    delete userState[userId];
  }
});

// Дидани рӯйхати супоришҳо
bot.command('list', async (ctx) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = await tasksDb.find({ task_date: { $gte: today } }).sort({ task_date: 1 });

  if (tasks.length === 0) return ctx.reply('Ҳоло ҳеҷ супориши фаъол нест.');

  let message = '📋 **Рӯйхати супоришҳо:**\n\n';
  tasks.forEach((row, index) => {
    message += `🔹 **№ ${index + 1}** | 📅 ${row.task_date}\n📌 ${row.title}\nID: \`${row._id}\`\n\n`;
  });
  ctx.reply(message, { parse_mode: 'Markdown' });
});

// Нест кардани супориш бо ID
bot.command('delete', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Танҳо админ.');
  const taskId = ctx.message.text.split(' ')[1];
  if (!taskId) return ctx.reply('Истифодабарӣ: `/delete ID_СУПОРИШ`', { parse_mode: 'Markdown' });

  const numRemoved = await tasksDb.remove({ _id: taskId }, {});
  if (numRemoved > 0) {
    ctx.reply(`🗑 Супориш нест карда шуд.`);
  } else {
    ctx.reply(`Супориш бо чунин ID ёфт нашуд.`);
  }
});

// Огоҳинома соати 09:00 саҳар (Cron)
cron.schedule('0 4 * * *', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const tasks = await tasksDb.find({ task_date: tomorrowStr });
  if (tasks.length === 0) return;

  const users = await usersDb.find({});
  if (users.length === 0) return;

  let notificationText = `⏰ **ОГОҲИНОМА! ФАРДО МУҲЛАТИ СУПОРИДАН АСТ:**\n\n`;
  tasks.forEach((t) => {
    notificationText += `📌 ${t.title}\n📅 Таърих: ${t.task_date}\n\n`;
  });

  users.forEach((u) => {
    bot.telegram.sendMessage(u.user_id, notificationText, { parse_mode: 'Markdown' })
      .catch((e) => console.error(e.message));
  });
});

bot.launch().then(() => console.log('Бот бомуваффақият фаъол шуд!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
