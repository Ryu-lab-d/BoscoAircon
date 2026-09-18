import { EventWindow, RoomSchedule, WEEK_DAYS } from '../types/timetable';

/**
 * Wire format sent to the microbits over UDP broadcast, one packet per room
 * (protocol v2 — see docs/superpowers/specs/2026-09-18-course-timetable-compiler-design.md
 * and microbit/general.ts / microbit/ungeneral.ts, which this must match exactly):
 *
 *   <RoomCode>|[WD<n>|<slot>...]*|E|<date>|<slot>...|H|<range>...|T|<chatId>...
 *
 * - `special` rooms always get all 7 WD markers (bare if that day has no
 *   windows) — their weekly section is an explicit, additive "on" schedule.
 * - `general` rooms only get a WD<n> marker for a day with at least one
 *   override window; other days are omitted entirely, and the firmware
 *   falls back to its own hardcoded default hours for them.
 * - A weekly slot omits its Y/N flag when enabled (bare = on); an event
 *   slot always carries an explicit flag.
 * - "E", "H", "T" are bare section markers, each omitted entirely when the
 *   room has nothing to say for that section.
 */

const FIELD_SEP = '|';

function encodeWeeklySlot(w: EventWindow): string {
  return w.enabled ? `${w.start}-${w.end}` : `${w.start}-${w.end}N`;
}

function encodeEventSlot(w: EventWindow): string {
  return `${w.start}-${w.end}${w.enabled ? 'Y' : 'N'}`;
}

export function buildRoomPacket(schedule: RoomSchedule): string {
  const parts: string[] = [schedule.room.code];
  const isSpecial = schedule.room.type === 'special';

  for (const day of WEEK_DAYS) {
    const slots = schedule.weekly[day];
    if (!isSpecial && slots.length === 0) {
      continue;
    }
    parts.push(`WD${day}`);
    for (const slot of slots) {
      parts.push(encodeWeeklySlot(slot));
    }
  }

  if (schedule.events.length > 0) {
    parts.push('E');
    for (const day of schedule.events) {
      parts.push(day.date);
      for (const window of day.windows) {
        parts.push(encodeEventSlot(window));
      }
    }
  }

  if (schedule.holidays.length > 0) {
    parts.push('H');
    for (const holiday of schedule.holidays) {
      parts.push(`${holiday.start}-${holiday.end}`);
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
