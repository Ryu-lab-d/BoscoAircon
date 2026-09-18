import { RoomSchedule } from '../types/timetable';

/** Returns "YYYYMMDD" for a date, in local time, matching the Events sheet's Date format. */
export function toDateCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * The microbit firmware ignores the packet's `<date>` token entirely — it
 * fails `parseTimeSlot()`'s length-9/10 check and is silently skipped (see
 * docs/TIMETABLE_FORMAT.md). Left unfiltered, a one-off event's windows
 * would be treated as active every day forever, purely by time-of-day.
 *
 * Callers must run resolved schedules through this before building/sending
 * packets, so only events actually relevant on `dateCode` (default: today)
 * go out. It does not affect what's shown for review/planning — filter
 * only at the point of broadcast.
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
