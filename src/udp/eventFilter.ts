import { RoomSchedule } from '../types/timetable';

/** Returns "YYYYMMDD" for a date, in local time, matching the Events sheet's Date format. */
export function toDateCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Protocol v2's firmware does its own date matching (see microbit/general.ts
 * / ungeneral.ts), so this is no longer needed for correctness — but a
 * SpecialEvents import can span a whole term's worth of dates, and there's
 * no reason to broadcast (and have every microbit hold in memory) event
 * windows for dates other than today. Callers should still run resolved
 * schedules through this before building/sending packets; it does not
 * affect what's shown for review/planning — filter only at the point of
 * broadcast.
 */
export function filterSchedulesForDate(
  schedules: RoomSchedule[],
  dateCode: string = toDateCode(new Date()),
): RoomSchedule[] {
  return schedules.map(schedule => ({
    ...schedule,
    events: schedule.events.filter(event => event.date === dateCode),
  }));
}
