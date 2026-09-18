import { read, utils, WorkBook } from 'xlsx';
import {
  EventEntry,
  HHMM,
  ParsedTimetable,
  Room,
  RoomCategory,
  RoomSchedule,
  RoomType,
  Tracker,
  TimetableEntry,
  WEEK_DAYS,
  WeekDay,
} from '../types/timetable';

const SHEET_ROOMS = 'Rooms';
const SHEET_TIMETABLE = 'Timetable';
const SHEET_EVENTS = 'Events';
const SHEET_TRACKERS = 'Trackers';

const HHMM_RE = /^([01]\d|2[0-3])[0-5]\d$/;
const DAY_RE = /^W([1-7])$/;
const DATE_RE = /^\d{8}$/;

/**
 * Reserved RoomCode in the Timetable sheet: defines the shared weekly
 * schedule every `general` room inherits (every room has aircon — this
 * just avoids repeating identical rows for rooms whose hours don't
 * differ). A `special` room instead lists its own rows under its own
 * RoomCode because its schedule is genuinely different.
 */
export const DEFAULT_TIMETABLE_CODE = 'DEFAULT';

export class TimetableParseError extends Error {}

function fail(sheet: string, row: number, message: string): never {
  throw new TimetableParseError(`${sheet} row ${row}: ${message}`);
}

function requireString(
  row: Record<string, unknown>,
  key: string,
  sheet: string,
  rowNum: number,
): string {
  const value = row[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    fail(sheet, rowNum, `missing required column "${key}"`);
  }
  return String(value).trim();
}

function optionalString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  return String(value).trim();
}

function parseHHMM(raw: string, sheet: string, rowNum: number, field: string): HHMM {
  // Excel stores a cell like "0030" as the plain number 30 unless the
  // column is formatted as text, so sheet_to_json can hand us "30", "5",
  // or "0" for what's meant to be a zero-padded HHMM time — pad up to 4
  // digits from any shorter length, not just 3.
  const padded = raw.padStart(4, '0');
  if (!HHMM_RE.test(padded)) {
    fail(sheet, rowNum, `"${field}" must be a 24h HHMM time, got "${raw}"`);
  }
  return padded;
}

function parseDay(raw: string, sheet: string, rowNum: number): WeekDay {
  const match = DAY_RE.exec(raw.toUpperCase());
  if (!match) {
    fail(sheet, rowNum, `"Day" must be one of W1-W7 (W1=Monday), got "${raw}"`);
  }
  return Number(match[1]) as WeekDay;
}

function parseEnabled(raw: string, sheet: string, rowNum: number): boolean {
  const upper = raw.toUpperCase();
  if (upper !== 'Y' && upper !== 'N') {
    fail(sheet, rowNum, `"Enabled" must be Y or N, got "${raw}"`);
  }
  return upper === 'Y';
}

function sheetRows(workbook: WorkBook, name: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    return [];
  }
  return utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function parseRooms(workbook: WorkBook): Room[] {
  const rows = sheetRows(workbook, SHEET_ROOMS);
  const rooms: Room[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const code = requireString(row, 'RoomCode', SHEET_ROOMS, rowNum);
    if (seen.has(code)) {
      fail(SHEET_ROOMS, rowNum, `duplicate RoomCode "${code}"`);
    }
    seen.add(code);

    const typeRaw = requireString(row, 'RoomType', SHEET_ROOMS, rowNum).toLowerCase();
    if (typeRaw !== 'special' && typeRaw !== 'general') {
      fail(SHEET_ROOMS, rowNum, `"RoomType" must be "special" or "general", got "${typeRaw}"`);
    }

    const categoryRaw = optionalString(row, 'Category')?.toLowerCase();
    if (categoryRaw && !['classroom', 'pe', 'project', 'other'].includes(categoryRaw)) {
      fail(
        SHEET_ROOMS,
        rowNum,
        `"Category" must be one of classroom/pe/project/other, got "${categoryRaw}"`,
      );
    }

    rooms.push({
      code,
      type: typeRaw as RoomType,
      category: categoryRaw as RoomCategory | undefined,
      location: optionalString(row, 'Location'),
      notes: optionalString(row, 'Notes'),
    });
  });

  return rooms;
}

function parseTimetable(workbook: WorkBook, rooms: Room[]): TimetableEntry[] {
  const rows = sheetRows(workbook, SHEET_TIMETABLE);
  const entries: TimetableEntry[] = [];
  const roomsByCode = new Map(rooms.map(r => [r.code, r]));

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const roomCode = requireString(row, 'RoomCode', SHEET_TIMETABLE, rowNum);
    if (roomCode !== DEFAULT_TIMETABLE_CODE) {
      const room = roomsByCode.get(roomCode);
      if (!room) {
        fail(SHEET_TIMETABLE, rowNum, `unknown RoomCode "${roomCode}" (not listed in Rooms, and not "${DEFAULT_TIMETABLE_CODE}")`);
      }
      if (room.type !== 'special') {
        fail(
          SHEET_TIMETABLE,
          rowNum,
          `RoomCode "${roomCode}" is a general room — general rooms share the "${DEFAULT_TIMETABLE_CODE}" schedule and can't have their own Timetable rows. Add rows under RoomCode "${DEFAULT_TIMETABLE_CODE}" instead, or change this room's RoomType to "special" if it genuinely needs its own hours.`,
        );
      }
    }
    const day = parseDay(requireString(row, 'Day', SHEET_TIMETABLE, rowNum), SHEET_TIMETABLE, rowNum);
    const start = parseHHMM(
      requireString(row, 'StartTime', SHEET_TIMETABLE, rowNum),
      SHEET_TIMETABLE,
      rowNum,
      'StartTime',
    );
    const end = parseHHMM(
      requireString(row, 'EndTime', SHEET_TIMETABLE, rowNum),
      SHEET_TIMETABLE,
      rowNum,
      'EndTime',
    );
    if (end <= start) {
      fail(SHEET_TIMETABLE, rowNum, `EndTime "${end}" must be after StartTime "${start}"`);
    }

    entries.push({ roomCode, day, range: { start, end } });
  });

  return entries;
}

function parseEvents(workbook: WorkBook, roomCodes: Set<string>): EventEntry[] {
  const rows = sheetRows(workbook, SHEET_EVENTS);
  const byKey = new Map<string, EventEntry>();
  // Tracks which RoomCodes each EventID has been used with, so the same ID
  // can't be reused for both "ALL" and a specific room — buildRoomSchedules
  // would otherwise expand both into that room's packet, duplicating the
  // EventID/Date marker.
  const roomCodesByEventId = new Map<string, Set<string>>();

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const eventId = requireString(row, 'EventID', SHEET_EVENTS, rowNum);
    if (!/^E\d+$/i.test(eventId)) {
      fail(SHEET_EVENTS, rowNum, `"EventID" must look like "E1", "E2", ..., got "${eventId}"`);
    }
    const roomCode = requireString(row, 'RoomCode', SHEET_EVENTS, rowNum);
    if (roomCode !== 'ALL' && !roomCodes.has(roomCode)) {
      fail(SHEET_EVENTS, rowNum, `unknown RoomCode "${roomCode}" (not listed in Rooms, and not "ALL")`);
    }

    const seenRoomCodes = roomCodesByEventId.get(eventId) ?? new Set<string>();
    if (roomCode === 'ALL' && seenRoomCodes.size > 0 && !seenRoomCodes.has('ALL')) {
      fail(
        SHEET_EVENTS,
        rowNum,
        `EventID "${eventId}" is already used for specific room(s) (${[...seenRoomCodes].join(', ')}) — it can't also be used with RoomCode "ALL". Use a different EventID for this row.`,
      );
    }
    if (roomCode !== 'ALL' && seenRoomCodes.has('ALL')) {
      fail(
        SHEET_EVENTS,
        rowNum,
        `EventID "${eventId}" is already used with RoomCode "ALL" — it can't also target room "${roomCode}" specifically. Use a different EventID for this row.`,
      );
    }
    seenRoomCodes.add(roomCode);
    roomCodesByEventId.set(eventId, seenRoomCodes);
    const date = requireString(row, 'Date', SHEET_EVENTS, rowNum);
    if (!DATE_RE.test(date)) {
      fail(SHEET_EVENTS, rowNum, `"Date" must be YYYYMMDD, got "${date}"`);
    }
    const start = parseHHMM(
      requireString(row, 'StartTime', SHEET_EVENTS, rowNum),
      SHEET_EVENTS,
      rowNum,
      'StartTime',
    );
    const end = parseHHMM(
      requireString(row, 'EndTime', SHEET_EVENTS, rowNum),
      SHEET_EVENTS,
      rowNum,
      'EndTime',
    );
    if (end <= start) {
      fail(SHEET_EVENTS, rowNum, `EndTime "${end}" must be after StartTime "${start}"`);
    }
    const enabled = parseEnabled(
      requireString(row, 'Enabled', SHEET_EVENTS, rowNum),
      SHEET_EVENTS,
      rowNum,
    );
    const name = optionalString(row, 'EventName');

    const key = `${eventId}::${roomCode}`;
    let event = byKey.get(key);
    if (!event) {
      event = { eventId, name, date, roomCode, windows: [] };
      byKey.set(key, event);
    } else {
      if (event.date !== date) {
        fail(SHEET_EVENTS, rowNum, `event "${eventId}" for room "${roomCode}" has inconsistent Date values`);
      }
      if (name && event.name && event.name !== name) {
        fail(
          SHEET_EVENTS,
          rowNum,
          `event "${eventId}" for room "${roomCode}" has inconsistent EventName values ("${event.name}" vs "${name}")`,
        );
      }
      // A later row can backfill EventName if only the first row left it blank.
      if (name && !event.name) {
        event.name = name;
      }
    }
    event.windows.push({ start, end, enabled });
  });

  return Array.from(byKey.values());
}

function parseTrackers(workbook: WorkBook, roomCodes: Set<string>): Tracker[] {
  const rows = sheetRows(workbook, SHEET_TRACKERS);
  const trackers: Tracker[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const roomCode = requireString(row, 'RoomCode', SHEET_TRACKERS, rowNum);
    if (!roomCodes.has(roomCode)) {
      fail(SHEET_TRACKERS, rowNum, `unknown RoomCode "${roomCode}" (not listed in Rooms)`);
    }
    const chatId = requireString(row, 'ChatID', SHEET_TRACKERS, rowNum);
    trackers.push({ roomCode, chatId, label: optionalString(row, 'Label') });
  });

  return trackers;
}

function parseWorkbook(workbook: WorkBook): ParsedTimetable {
  const rooms = parseRooms(workbook);
  const roomCodes = new Set(rooms.map(r => r.code));

  const timetable = parseTimetable(workbook, rooms);
  const events = parseEvents(workbook, roomCodes);
  const trackers = parseTrackers(workbook, roomCodes);

  return { rooms, timetable, events, trackers };
}

/** Parses a workbook buffer/array (e.g. from Node's fs) into the four flat tables. */
export function parseTimetableWorkbook(data: ArrayBuffer | Uint8Array): ParsedTimetable {
  return parseWorkbook(read(data, { type: 'array' }));
}

/**
 * Parses a workbook from a base64 string — the encoding
 * `react-native-fs`'s `readFile()` returns, so the app can parse a file
 * the user picked on-device without a manual base64-to-bytes decode.
 */
export function parseTimetableWorkbookFromBase64(base64: string): ParsedTimetable {
  return parseWorkbook(read(base64, { type: 'base64' }));
}

function buildWeekly(entries: TimetableEntry[], matchRoomCode: string): RoomSchedule['weekly'] {
  const weekly = WEEK_DAYS.reduce((acc, d) => {
    acc[d] = [];
    return acc;
  }, {} as RoomSchedule['weekly']);

  for (const entry of entries) {
    if (entry.roomCode === matchRoomCode) {
      weekly[entry.day].push(entry.range);
    }
  }
  for (const day of WEEK_DAYS) {
    weekly[day].sort((a, b) => a.start.localeCompare(b.start));
  }
  return weekly;
}

/**
 * Builds a fully resolved, per-room schedule for every room, expanding
 * "ALL" events into each room and sorting weekly windows chronologically.
 * This is the shape consumed by the UDP packet builder.
 *
 * Every room gets a weekly schedule: `special` rooms use their own rows
 * from the Timetable sheet, `general` rooms all share the one schedule
 * defined under RoomCode "DEFAULT".
 */
export function buildRoomSchedules(parsed: ParsedTimetable): RoomSchedule[] {
  const defaultWeekly = buildWeekly(parsed.timetable, DEFAULT_TIMETABLE_CODE);

  return parsed.rooms.map(room => {
    const weekly = room.type === 'special' ? buildWeekly(parsed.timetable, room.code) : defaultWeekly;

    const events = parsed.events
      .filter(e => e.roomCode === room.code || e.roomCode === 'ALL')
      .map(e => ({
        ...e,
        windows: [...e.windows].sort((a, b) => a.start.localeCompare(b.start)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));

    const trackers = parsed.trackers.filter(t => t.roomCode === room.code);

    return { room, weekly, events, trackers };
  });
}
