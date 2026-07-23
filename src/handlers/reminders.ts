import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getHabit,
  saveOccurrence,
  getOccurrenceByHabitDate,
  getOccurrencesForHabit,
  calcStreak,
} from "../storage.js";

const composer = new Composer<Ctx>();

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// Handle "Done" button from a reminder message
composer.callbackQuery(/^reminder:done:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) return;

  const today = todayStr();
  const existing = await getOccurrenceByHabitDate(habitId, today);
  if (existing?.status === "done") {
    await ctx.editMessageText("Already checked in! Nice work 🎉", {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Dashboard", "dashboard:refresh")],
      ]),
    });
    return;
  }

  const occ = {
    id: `${habitId}:${today}`,
    habitId,
    userId: ctx.from.id,
    date: today,
    status: "done" as const,
    timestamp: Date.now(),
  };
  await saveOccurrence(occ);

  const occs = await getOccurrencesForHabit(habitId);
  const streak = calcStreak(occs);

  await ctx.editMessageText(
    `✅ "${habit.title}" — done!\n🔥 Streak: ${streak.current} days`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Dashboard", "dashboard:refresh")],
      ]),
    },
  );
});

// Handle "Skip" button from a reminder message
composer.callbackQuery(/^reminder:skip:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "No worries — tomorrow is a fresh start." });
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);
  if (!habit || habit.userId !== ctx.from.id) return;

  await ctx.editMessageText(
    `Skipped "${habit.title}" for today. Tomorrow is a fresh start 🌱`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Dashboard", "dashboard:refresh")],
      ]),
    },
  );
});

export default composer;
