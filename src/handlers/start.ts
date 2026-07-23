import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "➕ New Habit", data: "habit:new", order: 10 });
registerMainMenuItem({ label: "📋 My Habits", data: "dashboard:show", order: 20 });
registerMainMenuItem({ label: "📊 Weekly Recap", data: "recap:show", order: 30 });
registerMainMenuItem({ label: "⚙️ Settings", data: "settings:show", order: 40 });

const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
