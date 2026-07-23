import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import {
  getUserHabits,
  getOccurrencesForHabit,
  calcStreak,
  calcCompletionRate,
} from "../storage.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("recap:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  const habits = await getUserHabits(userId);

  if (habits.length === 0) {
    await ctx.editMessageText(
      "No habits yet — can't generate a recap until you've created some.",
      { reply_markup: mainMenuKeyboard() },
    );
    return;
  }

  const now = new Date();
  const lines: string[] = ["📊 Weekly recap:", ""];

  let totalDone = 0;
  let totalPossible = 0;

  for (const h of habits) {
    const occs = await getOccurrencesForHabit(h.id);
    const streak = calcStreak(occs);
    const rate = calcCompletionRate(occs, 7, () => now);
    const done = Math.round(rate * 7);
    totalDone += done;
    totalPossible += 7;

    const pause = h.paused ? " (paused)" : "";
    lines.push(`📌 ${h.title}${pause}`);
    lines.push(`   This week: ${done}/7 days • 🔥 ${streak.current} day streak`);

    if (streak.current >= 7) {
      lines.push(`   🏆 7+ day streak!`);
    }
    if (streak.longest >= 30) {
      lines.push(`   🌟 Best streak ever: ${streak.longest} days`);
    }
    lines.push("");
  }

  const overallRate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
  lines.push(`Overall: ${overallRate}% completion this week`);

  if (overallRate >= 80) {
    lines.push("🎉 Amazing week! You're building real momentum.");
  } else if (overallRate >= 50) {
    lines.push("💪 Solid effort! Keep showing up — consistency is the key.");
  } else if (overallRate > 0) {
    lines.push("🌱 Every check-in counts. Tomorrow is a fresh start.");
  } else {
    lines.push("No check-ins this week. That's okay — tap a habit to start fresh.");
  }

  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
