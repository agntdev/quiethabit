import type { StorageAdapter } from "grammy";
import { MemorySessionStorage } from "./toolkit/session/memory.js";

// Durable data entities for the Habit Tracker bot.
// Uses toolkit's StorageAdapter-backed storage (in-memory for dev/tests,
// Redis-backed in production). Never in-memory Maps.

export interface Habit {
  id: string;
  userId: number;
  title: string;
  cadence: "daily" | "weekdays" | "weekends" | "custom";
  reminderHour: number;
  reminderMinute: number;
  paused: boolean;
  createdAt: number;
}

export interface Occurrence {
  id: string;
  habitId: string;
  userId: number;
  date: string; // YYYY-MM-DD in user's local time
  status: "done" | "missed";
  timestamp: number;
}

export interface UserPrefs {
  telegramId: number;
  timeZone: string;
  weeklyRecapDay: number; // 0=Sun, 1=Mon, ..., 6=Sat
  celebrationsEnabled: boolean;
}

// Storage keys
const HABIT_PREFIX = "habit:";
const HABIT_INDEX_PREFIX = "hidx:";
const OCCURRENCE_PREFIX = "occ:";
const OCC_INDEX_PREFIX = "oidx:";
const USER_PREFS_PREFIX = "upref:";

// In-memory adapter for all durable storage (replaced by Redis in production).
const store: StorageAdapter<unknown> = new MemorySessionStorage<unknown>();

async function get<T>(key: string): Promise<T | undefined> {
  return store.read(key) as Promise<T | undefined>;
}

async function put<T>(key: string, value: T): Promise<void> {
  await store.write(key, value);
}

async function del(key: string): Promise<void> {
  await store.delete(key);
}

// --- User Prefs ---

export async function getUserPrefs(userId: number): Promise<UserPrefs> {
  const key = USER_PREFS_PREFIX + userId;
  return (
    (await get<UserPrefs>(key)) ?? {
      telegramId: userId,
      timeZone: "UTC",
      weeklyRecapDay: 1,
      celebrationsEnabled: true,
    }
  );
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  await put(USER_PREFS_PREFIX + prefs.telegramId, prefs);
}

// --- Habits ---

export async function getHabit(habitId: string): Promise<Habit | undefined> {
  return get<Habit>(HABIT_PREFIX + habitId);
}

export async function saveHabit(habit: Habit): Promise<void> {
  await put(HABIT_PREFIX + habit.id, habit);
  // Update user's habit index
  const indexKey = HABIT_INDEX_PREFIX + habit.userId;
  const ids = (await get<string[]>(indexKey)) ?? [];
  if (!ids.includes(habit.id)) {
    ids.push(habit.id);
    await put(indexKey, ids);
  }
}

export async function deleteHabit(habitId: string, userId: number): Promise<void> {
  await del(HABIT_PREFIX + habitId);
  const indexKey = HABIT_INDEX_PREFIX + userId;
  const ids = (await get<string[]>(indexKey)) ?? [];
  const filtered = ids.filter((id) => id !== habitId);
  await put(indexKey, filtered);
}

export async function getUserHabits(userId: number): Promise<Habit[]> {
  const indexKey = HABIT_INDEX_PREFIX + userId;
  const ids = (await get<string[]>(indexKey)) ?? [];
  const habits: Habit[] = [];
  for (const id of ids) {
    const h = await getHabit(id);
    if (h) habits.push(h);
  }
  return habits;
}

// --- Occurrences ---

export async function getOccurrence(occId: string): Promise<Occurrence | undefined> {
  return get<Occurrence>(OCCURRENCE_PREFIX + occId);
}

export async function saveOccurrence(occ: Occurrence): Promise<void> {
  await put(OCCURRENCE_PREFIX + occ.id, occ);
  // Update occurrence index: habitId + date → occId
  const dateKey = OCC_INDEX_PREFIX + occ.habitId + ":" + occ.date;
  await put(dateKey, occ.id);
  // Update occurrence list index: habitId → occId[]
  const listKey = OCC_INDEX_PREFIX + occ.habitId;
  const ids = (await get<string[]>(listKey)) ?? [];
  if (!ids.includes(occ.id)) {
    ids.push(occ.id);
    await put(listKey, ids);
  }
}

export async function getOccurrenceByHabitDate(
  habitId: string,
  date: string,
): Promise<Occurrence | undefined> {
  const dateKey = OCC_INDEX_PREFIX + habitId + ":" + date;
  const id = await get<string>(dateKey);
  if (!id) return undefined;
  return getOccurrence(id);
}

export async function getOccurrencesForHabit(habitId: string): Promise<Occurrence[]> {
  const listKey = OCC_INDEX_PREFIX + habitId;
  const ids = (await get<string[]>(listKey)) ?? [];
  const occs: Occurrence[] = [];
  for (const id of ids) {
    const occ = await getOccurrence(id);
    if (occ) occs.push(occ);
  }
  return occs;
}

// --- Streak calculation ---

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function calcStreak(occurrences: Occurrence[]): {
  current: number;
  longest: number;
} {
  if (occurrences.length === 0) return { current: 0, longest: 0 };

  const doneDates = new Set(
    occurrences.filter((o) => o.status === "done").map((o) => o.date),
  );
  if (doneDates.size === 0) return { current: 0, longest: 0 };

  const sorted = [...doneDates].sort();
  const lastDate = sorted[sorted.length - 1];

  // Current streak: count back from last done date
  let current = 0;
  const d = new Date(lastDate + "T12:00:00Z");
  while (doneDates.has(dateStr(d))) {
    current++;
    d.setDate(d.getDate() - 1);
  }

  // Longest streak: scan all sorted dates
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T12:00:00Z");
    const curr = new Date(sorted[i] + "T12:00:00Z");
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (Math.round(diffDays) === 1) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  return { current, longest };
}

// --- Completion rate (last N days) ---

export function calcCompletionRate(
  occurrences: Occurrence[],
  days: number,
  now: () => Date = () => new Date(),
): number {
  if (days <= 0) return 0;
  const today = now();
  const doneDates = new Set(
    occurrences.filter((o) => o.status === "done").map((o) => o.date),
  );
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (doneDates.has(dateStr(d))) done++;
  }
  return done / days;
}


