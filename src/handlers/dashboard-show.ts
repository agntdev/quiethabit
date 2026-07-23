import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import { getUserHabits, getOccurrencesForHabit, calcStreak, getOccurrenceByHabitDate } from "../storage.js";

const composer = new Composer<Ctx>();

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

async function buildDashboard(userId: number): Promise<{ text: string; keyboard: import("../toolkit/ui/keyboard.js").InlineKeyboardMarkup }> {
  const habits = await getUserHabits(userId);

  if (habits.length === 0) {
    return {
      text: "No habits yet — tap ➕ New Habit to create your first one.",
      keyboard: mainMenuKeyboard(),
    };
  }

  const today = todayStr();
  const lines: string[] = ["📋 Your habits:", ""];
  const rows: ReturnType<typeof inlineButton>[][] = [];

  for (const h of habits) {
    const occs = await getOccurrencesForHabit(h.id);
    const streak = calcStreak(occs);
    const todayOcc = await getOccurrenceByHabitDate(h.id, today);
    const checkedToday = todayOcc?.status === "done";
    const pause = h.paused ? " (paused)" : "";
    const check = checkedToday ? "✅" : "⬜";

    lines.push(`${check} ${h.title}${pause} — 🔥 ${streak.current} day streak`);

    if (!h.paused && !checkedToday) {
      rows.push([inlineButton(`✅ Done: ${h.title}`, `habit:checkin:${h.id}`)]);
    }
  }

  if (rows.length === 0) {
    lines.push("");
    lines.push("All caught up for today! Nice work 🎉");
  }

  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  return { text: lines.join("\n"), keyboard: inlineKeyboard(rows) };
}

composer.callbackQuery("dashboard:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { text, keyboard } = await buildDashboard(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard });
});

// Re-render dashboard from sub-views
composer.callbackQuery("dashboard:refresh", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { text, keyboard } = await buildDashboard(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: keyboard });
});

export default composer;
