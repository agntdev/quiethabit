import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
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

composer.callbackQuery(/^habit:checkin:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const habitId = ctx.match[1];
  const habit = await getHabit(habitId);

  if (!habit || habit.userId !== ctx.from.id) {
    await ctx.reply("Couldn't find that habit. Try again?");
    return;
  }

  if (habit.paused) {
    await ctx.reply("This habit is paused. Resume it first to check in.");
    return;
  }

  const today = todayStr();
  const existing = await getOccurrenceByHabitDate(habitId, today);
  if (existing?.status === "done") {
    await ctx.reply("You already checked in for this one today! Keep it up 🎉");
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

  let encouragement = "";
  if (streak.current === 7) encouragement = "\n🔥 7 days! One week strong!";
  else if (streak.current === 30) encouragement = "\n🏆 30 days! You're unstoppable!";
  else if (streak.current > 0) encouragement = "\nNice — keep the streak going!";

  await ctx.reply(
    `✅ "${habit.title}" — done for today!${encouragement}\n\n🔥 Streak: ${streak.current} days`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Back to dashboard", "dashboard:refresh")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
