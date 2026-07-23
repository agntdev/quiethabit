import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";
import { saveHabit, saveUserPrefs, getUserPrefs, getUserHabits, calcStreak, getOccurrencesForHabit } from "../storage.js";

const composer = new Composer<Ctx>();

const CADENCE_OPTIONS = [
  { text: "Daily", data: "habit:caddaily" },
  { text: "Weekdays", data: "habit:cadweekdays" },
  { text: "Weekends", data: "habit:cadweekends" },
];

const TIME_OPTIONS = [
  { text: "8:00 AM", data: "habit:time08:00" },
  { text: "12:00 PM", data: "habit:time12:00" },
  { text: "6:00 PM", data: "habit:time18:00" },
  { text: "8:00 PM", data: "habit:time20:00" },
  { text: "Custom", data: "habit:timecustom" },
];

function timeFromData(data: string): { hour: number; minute: number } | null {
  const m = data.match(/^habit:time(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

function formatTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case "daily": return "Every day";
    case "weekdays": return "Weekdays (Mon–Fri)";
    case "weekends": return "Weekends (Sat–Sun)";
    default: return cadence;
  }
}

// Step 1: User taps "New Habit" → ask for title
composer.callbackQuery("habit:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_title";
  await ctx.reply("What's the habit you'd like to build?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. Meditate 10 minutes" },
  });
});

// Step 2: User types title → ask for cadence
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_title") return next();

  const title = ctx.message.text.trim();
  if (title.length < 1 || title.length > 100) {
    await ctx.reply("Keep it short — one to three words work best. Try again?");
    return;
  }

  ctx.session.habitTitle = title;
  ctx.session.step = "awaiting_cadence";

  await ctx.reply(`How often do you want to do "${title}"?`, {
    reply_markup: inlineKeyboard([
      CADENCE_OPTIONS.map((o) => inlineButton(o.text, o.data)),
      [inlineButton("Cancel", "habit:cancel")],
    ]),
  });
});

// Step 3: User picks cadence → ask for reminder time
composer.callbackQuery(/^habit:cad(daily|weekdays|weekends)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const cadence = ctx.match[1];
  ctx.session.habitCadence = cadence;
  ctx.session.step = "awaiting_time";

  await ctx.reply("When should I remind you?", {
    reply_markup: inlineKeyboard([
      TIME_OPTIONS.map((o) => inlineButton(o.text, o.data)),
      [inlineButton("Cancel", "habit:cancel")],
    ]),
  });
});

// Step 4: User picks time → show confirmation
composer.callbackQuery(/^habit:time(\d{2}):(\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const hour = parseInt(ctx.match[1], 10);
  const minute = parseInt(ctx.match[2], 10);
  ctx.session.habitReminderHour = hour;
  ctx.session.habitReminderMinute = minute;
  ctx.session.habitReminderTime = formatTime(hour, minute);
  ctx.session.step = "confirming_create";

  const title = ctx.session.habitTitle ?? "New habit";
  const cadence = cadenceLabel(ctx.session.habitCadence ?? "daily");
  const time = ctx.session.habitReminderTime;

  await ctx.reply(
    `Here's your new habit:\n\n` +
    `📌 ${title}\n` +
    `🔄 ${cadence}\n` +
    `⏰ Reminder at ${time}\n\n` +
    `Looks good?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✅ Create habit", "habit:confirmcreate")],
        [inlineButton("Cancel", "habit:cancel")],
      ]),
    },
  );
});

// Custom time: ask user to type it
composer.callbackQuery("habit:timecustom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_custom_time";
  await ctx.reply("What time should I remind you? Type it like 7:30 or 14:15.", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. 7:30 or 14:15" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_custom_time") return next();

  const text = ctx.message.text.trim();
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    await ctx.reply("I need a time like 7:30 or 14:15. Try again?");
    return;
  }

  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    await ctx.reply("That time doesn't look right. Try again?");
    return;
  }

  ctx.session.habitReminderHour = hour;
  ctx.session.habitReminderMinute = minute;
  ctx.session.habitReminderTime = formatTime(hour, minute);
  ctx.session.step = "confirming_create";

  const title = ctx.session.habitTitle ?? "New habit";
  const cadence = cadenceLabel(ctx.session.habitCadence ?? "daily");
  const time = ctx.session.habitReminderTime;

  await ctx.reply(
    `Here's your new habit:\n\n` +
    `📌 ${title}\n` +
    `🔄 ${cadence}\n` +
    `⏰ Reminder at ${time}\n\n` +
    `Looks good?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✅ Create habit", "habit:confirmcreate")],
        [inlineButton("Cancel", "habit:cancel")],
      ]),
    },
  );
});

// Step 5: Confirm → save and show dashboard
composer.callbackQuery("habit:confirmcreate", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from.id;
  const title = ctx.session.habitTitle ?? "New habit";
  const cadence = (ctx.session.habitCadence as "daily" | "weekdays" | "weekends") ?? "daily";
  const hour = ctx.session.habitReminderHour ?? 20;
  const minute = ctx.session.habitReminderMinute ?? 0;

  const habit = {
    id: `${userId}:${Date.now()}`,
    userId,
    title,
    cadence,
    reminderHour: hour,
    reminderMinute: minute,
    paused: false,
    createdAt: Date.now(),
  };

  await saveHabit(habit);

  // Ensure user prefs exist
  const prefs = await getUserPrefs(userId);
  await saveUserPrefs(prefs);

  // Reset session
  ctx.session.step = undefined;
  ctx.session.habitTitle = undefined;
  ctx.session.habitCadence = undefined;
  ctx.session.habitReminderTime = undefined;
  ctx.session.habitReminderHour = undefined;
  ctx.session.habitReminderMinute = undefined;

  // Show the habit was created + dashboard preview
  const habits = await getUserHabits(userId);
  const lines: string[] = [`✅ "${title}" created!`];
  lines.push("");
  lines.push("Your habits:");
  for (const h of habits) {
    const occs = await getOccurrencesForHabit(h.id);
    const streak = calcStreak(occs);
    const pause = h.paused ? " (paused)" : "";
    lines.push(`  📌 ${h.title}${pause} — 🔥 ${streak.current} day streak`);
  }

  await ctx.reply(lines.join("\n"), { reply_markup: mainMenuKeyboard() });
});

// Cancel
composer.callbackQuery("habit:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.habitTitle = undefined;
  ctx.session.habitCadence = undefined;
  ctx.session.habitReminderTime = undefined;
  ctx.session.habitReminderHour = undefined;
  ctx.session.habitReminderMinute = undefined;

  await ctx.editMessageText("No worries — cancelled. Tap a button when you're ready.", {
    reply_markup: mainMenuKeyboard(),
  });
});

export default composer;
