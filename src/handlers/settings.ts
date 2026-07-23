import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import { getUserPrefs, saveUserPrefs } from "../storage.js";

const composer = new Composer<Ctx>();

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour} ${ampm}`;
}

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prefs = await getUserPrefs(ctx.from.id);

  await ctx.editMessageText(
    `⚙️ Settings\n\n` +
    `🌍 Time zone: ${prefs.timeZone}\n` +
    `📅 Weekly recap day: ${DAY_NAMES[prefs.weeklyRecapDay]}\n` +
    `🎉 Celebrations: ${prefs.celebrationsEnabled ? "On" : "Off"}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🌍 Change time zone", "settings:setzone")],
        [inlineButton("📅 Change recap day", "settings:setrecapday")],
        [inlineButton("🎉 Toggle celebrations", "settings:togglecel")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Change time zone
composer.callbackQuery("settings:setzone", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_timezone";
  await ctx.reply("What's your time zone? Type it like UTC, EST, or Asia/Tokyo.", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. America/New_York" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_timezone") return next();

  const tz = ctx.message.text.trim();
  if (tz.length < 2 || tz.length > 50) {
    await ctx.reply("That doesn't look like a valid time zone. Try again?");
    return;
  }

  const prefs = await getUserPrefs(ctx.from.id);
  prefs.timeZone = tz;
  await saveUserPrefs(prefs);
  ctx.session.step = undefined;

  await ctx.reply(`Time zone set to ${tz}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:show")],
    ]),
  });
});

// Change recap day
composer.callbackQuery("settings:setrecapday", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prefs = await getUserPrefs(ctx.from.id);
  const rows = DAY_NAMES.map((day, i) => {
    const marker = i === prefs.weeklyRecapDay ? " ✓" : "";
    return [inlineButton(`${day}${marker}`, `settings:recapday:${i}`)];
  });

  await ctx.editMessageText("Which day for your weekly recap?", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^settings:recapday:(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const day = parseInt(ctx.match[1], 10);
  const prefs = await getUserPrefs(ctx.from.id);
  prefs.weeklyRecapDay = day;
  await saveUserPrefs(prefs);

  await ctx.editMessageText(`Weekly recap set to ${DAY_NAMES[day]}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:show")],
    ]),
  });
});

// Toggle celebrations
composer.callbackQuery("settings:togglecel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const prefs = await getUserPrefs(ctx.from.id);
  prefs.celebrationsEnabled = !prefs.celebrationsEnabled;
  await saveUserPrefs(prefs);

  const status = prefs.celebrationsEnabled ? "on" : "off";
  await ctx.editMessageText(`Celebration notifications turned ${status}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:show")],
    ]),
  });
});

export default composer;
