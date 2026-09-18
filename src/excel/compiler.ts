import { WorkBook } from 'xlsx';
import { ALL_ROOMS, emptyWeekly } from '../config/rooms';
import { Holiday, RoomEventDay, RoomMappingRule, RoomSchedule, SpecialEventRow, Tracker } from '../types/timetable';
import { compileWeeklyOverrides, TimetableWarning } from './timetableCompiler';

export interface CompileInputs {
  timetable: WorkBook;
  roomMappingRules?: RoomMappingRule[];
  specialEvents?: SpecialEventRow[];
  trackers?: Tracker[];
  holidays?: Holiday[];
}

export interface CompileResult {
  schedules: RoomSchedule[];
  warnings: TimetableWarning[];
}

function groupEventsByRoom(specialEvents: SpecialEventRow[]): Map<string, RoomEventDay[]> {
  // roomCode -> date -> windows, so "ALL" rows and room-specific rows for
  // the same date merge into one RoomEventDay instead of two.
  const byRoomDate = new Map<string, Map<string, RoomEventDay>>();

  function addTo(roomCode: string, row: SpecialEventRow) {
    let byDate = byRoomDate.get(roomCode);
    if (!byDate) {
      byDate = new Map();
      byRoomDate.set(roomCode, byDate);
    }
    let day = byDate.get(row.date);
    if (!day) {
      day = { date: row.date, windows: [] };
      byDate.set(row.date, day);
    }
    day.windows.push(row.window);
  }

  for (const row of specialEvents) {
    if (row.roomCode === 'ALL') {
      for (const room of ALL_ROOMS) {
        addTo(room.code, row);
      }
    } else {
      addTo(row.roomCode, row);
    }
  }

  const result = new Map<string, RoomEventDay[]>();
  for (const [roomCode, byDate] of byRoomDate) {
    const days = Array.from(byDate.values())
      .map(day => ({ ...day, windows: [...day.windows].sort((a, b) => a.start.localeCompare(b.start)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    result.set(roomCode, days);
  }
  return result;
}

/**
 * Combines the real timetable (the biggest input, derived via
 * compileWeeklyOverrides) with the four supporting Excel imports into one
 * fully resolved RoomSchedule per known room (see config/rooms.ts) — every
 * field but `timetable` is optional, since RoomMappingRules/SpecialEvents/
 * Trackers/Holidays each default to "none" when not imported.
 */
export function compileSchedules(inputs: CompileInputs): CompileResult {
  const { weeklyByRoom, warnings } = compileWeeklyOverrides(inputs.timetable, inputs.roomMappingRules ?? []);
  const eventsByRoom = groupEventsByRoom(inputs.specialEvents ?? []);
  const holidays = inputs.holidays ?? [];
  const trackers = inputs.trackers ?? [];

  const schedules = ALL_ROOMS.map((room): RoomSchedule => ({
    room,
    weekly: weeklyByRoom.get(room.code) ?? emptyWeekly(),
    events: eventsByRoom.get(room.code) ?? [],
    holidays,
    trackers: trackers.filter(t => t.roomCode === room.code),
  }));

  return { schedules, warnings };
}
