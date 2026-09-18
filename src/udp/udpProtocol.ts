import { RoomSchedule, WEEK_DAYS } from '../types/timetable';

/**
 * Wire format sent to the microbits over UDP broadcast, one packet per room.
 * Every microbit receives every packet and ignores ones that don't start
 * with its own room code.
 *
 *   <RoomCode>|WD1|<start>-<end>|<start>-<end>|WD2|...|WD7|...|E1|<date>|<start>-<end>Y|<start>-<end>N|...|T|<chatId>|<chatId>|...
 *
 * Every room gets the weekly WD1-WD7 section — every room has aircon.
 * `special` vs `general` (src/types/timetable.ts) only decides which rows
 * of the Excel Timetable sheet a room's schedule is resolved from
 * (buildRoomSchedules() in src/excel/excelParser.ts); it has no effect on
 * the packet shape.
 *
 * The WD<n>/E<id>/T tokens are section markers: a day or event section with
 * no windows is just the bare marker followed immediately by the next
 * marker. The T section (and its trailing chat ids) is omitted entirely
 * when the room has no trackers.
 *
 * This must match the microbit firmware's parseChart() token grammar
 * exactly: it detects a weekday marker via `token.indexOf("WD") === 0`
 * (not "W"), an event marker via `token.indexOf("E") === 0`, and a time
 * slot via exact length 9 (`HHMM-HHMM`) or 10 (`HHMM-HHMM` + `Y`/`N`).
 * The firmware currently ignores the per-event `<date>` token entirely
 * (it fails the length-9/10 check and is silently skipped) — see the
 * "event date filtering" note in docs/TIMETABLE_FORMAT.md.
 */

const FIELD_SEP = '|';

function timeRange(start: string, end: string): string {
  return `${start}-${end}`;
}

export function buildRoomPacket(schedule: RoomSchedule): string {
  const parts: string[] = [schedule.room.code];

  for (const day of WEEK_DAYS) {
    parts.push(`WD${day}`);
    for (const range of schedule.weekly[day]) {
      parts.push(timeRange(range.start, range.end));
    }
  }

  for (const event of schedule.events) {
    parts.push(event.eventId);
    parts.push(event.date);
    for (const window of event.windows) {
      parts.push(`${timeRange(window.start, window.end)}${window.enabled ? 'Y' : 'N'}`);
    }
  }

  if (schedule.trackers.length > 0) {
    parts.push('T');
    for (const tracker of schedule.trackers) {
      parts.push(tracker.chatId);
    }
  }

  return parts.join(FIELD_SEP);
}

export function buildAllPackets(schedules: RoomSchedule[]): Map<string, string> {
  const packets = new Map<string, string>();
  for (const schedule of schedules) {
    packets.set(schedule.room.code, buildRoomPacket(schedule));
  }
  return packets;
}
