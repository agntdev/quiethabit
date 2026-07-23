import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import {
  getHabit,
  deleteHabit,
  saveHabit,
  getOccurrencesForHabit,
  calcStreak,
} from "../storage.js";

const composer = new Composer<Ctx>();

// Show manage options for a habit
composer.callbackQuery(/^habit:manage:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) {
    await ctx.reply("Couldn't find that habit. Try again?");
    return;
  }

  const occs = await getOccurrencesForHabit(habitId);
  const streak = calcStreak(occs);
  const status = habit.paused ? "Paused" : "Active";
  const pauseBtn = habit.paused
    ? [inlineButton("▶️ Resume", `habit:resume:${habitId}`)]
    : [inlineButton("⏸️ Pause", `habit:pause:${habitId}`)];

  await ctx.editMessageText(
    `📌 ${habit.title}\n` +
    `Status: ${status}\n` +
    `🔥 Streak: ${streak.current} days\n` +
    `⏰ Reminder: ${habit.reminderHour.toString().padStart(2, "0")}:${habit.reminderMinute.toString().padStart(2, "0")}\n\n` +
    `What would you like to do?`,
    {
      reply_markup: inlineKeyboard([
        pauseBtn,
        [inlineButton("🗑 Delete", `habit:delete:${habitId}`)],
        [inlineButton("⬅️ Back to dashboard", "dashboard:refresh")],
      ]),
    },
  );
});

// Pause a habit
composer.callbackQuery(/^habit:pause:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) return;

  habit.paused = true;
  await saveHabit(habit);

  await ctx.editMessageText(`"${habit.title}" is paused. Tap Resume to pick it back up.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("▶️ Resume", `habit:resume:${habitId}`)],
      [inlineButton("⬅️ Back to dashboard", "dashboard:refresh")],
    ]),
  });
});

// Resume a habit
composer.callbackQuery(/^habit:resume:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) return;

  habit.paused = false;
  await saveHabit(habit);

  await ctx.editMessageText(`"${habit.title}" is back on! Let's go 💪`, {
    reply_markup: inlineKeyboard([
      [inlineButton("📋 Back to dashboard", "dashboard:refresh")],
    ]),
  });
});

// Show delete confirmation
composer.callbackQuery(/^habit:delete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) return;

  await ctx.editMessageText(
    `Delete "${habit.title}"? This can't be undone.`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("🗑 Yes, delete", `habit:confirmdelete:${habitId}`),
          inlineButton("No, keep it", `habit:manage:${habitId}`),
        ],
      ]),
    },
  );
});

// Actually delete
composer.callbackQuery(/^habit:confirmdelete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) return;

  await deleteHabit(habitId, ctx.from.id);

  await ctx.editMessageText(`"${habit.title}" deleted.`, {
    reply_markup: mainMenuKeyboard(),
  });
});

export default composer;
