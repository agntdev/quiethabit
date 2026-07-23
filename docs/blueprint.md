# Habit Tracker — Bot specification

**Archetype:** custom

**Voice:** gentle and encouraging — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot that helps users create and track habits with flexible schedules, sends daily reminders, tracks streaks, and provides weekly recaps while maintaining strict data privacy.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual users seeking habit formation tools
- privacy-conscious productivity enthusiasts

## Success criteria

- Users can create and track 3+ habits within first week
- 90% of scheduled reminders are delivered on time
- Streak tracking accuracy validated in weekly recaps

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with habit dashboard
- **New Habit** (button, actor: user, callback: habit:new) — Initiate habit creation flow
  - inputs: habit title, cadence type, reminder time
  - outputs: confirmation message with habit details
- **My Habits** (button, actor: user, callback: dashboard:show) — Display compact habit dashboard
  - inputs: user ID
  - outputs: habit list with current streaks

## Flows

### onboarding
_Trigger:_ /start

1. Welcome message
2. Habit creation wizard
3. Initial dashboard preview

_Data touched:_ User, Habit

### daily_reminder
_Trigger:_ scheduled local time

1. Send reminder message with buttons
2. Record button interaction
3. Update streak status

_Data touched:_ Occurrence, Stats

### weekly_recap
_Trigger:_ user-selected day

1. Generate progress summary
2. Display milestone achievements
3. Offer encouragement

_Data touched:_ Stats, Habit

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram account with time zone and preferences
  - fields: telegram_id, time_zone, weekly_recap_day
- **Habit** _(retention: persistent)_ — User-defined habit with tracking rules
  - fields: title, cadence, reminder_time, celebration_thresholds, paused
- **Occurrence** _(retention: persistent)_ — Daily habit status tracking
  - fields: date, status, timestamp
- **Stats** _(retention: persistent)_ — Derived metrics for progress tracking
  - fields: current_streak, longest_streak, completion_rate

## Integrations

- **Telegram** (required) — Bot API messaging and inline buttons
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Create/edit/delete habits
- Adjust reminder times
- Pause/resume habits
- View weekly recaps
- Toggle celebration notifications

## Notifications

- Daily habit reminders
- Milestone celebration messages
- Weekly progress recaps
- Streak update alerts

## Permissions & privacy

- All data strictly user-isolated
- No third-party data sharing
- Time zone-aware local delivery
- Manual backdating limited to 7 days

## Edge cases

- Time zone changes mid-streak
- Duplicate check-in prevention
- Missed day auto-marking at midnight
- Celebration threshold validation

## Required tests

- End-to-end reminder delivery with button interactions
- Streak calculation accuracy across cadence types
- Weekly recap generation with sample data

## Assumptions

- Default 20:00 reminder time for new habits
- Monday morning default for weekly recaps
- Auto-detected time zones with manual override
