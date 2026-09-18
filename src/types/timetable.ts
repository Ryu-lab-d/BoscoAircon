/**
 * Domain model for the BoscoAircon timetable system.
 * See docs/TIMETABLE_FORMAT.md for the Excel schema and UDP wire format
 * this model is parsed from / serialized to.
 */

export type RoomType = 'special' | 'general';

export type RoomCategory = 'classroom' | 'pe' | 'project' | 'other';

export interface Room {
  /** Unique code the microbit in the room matches against, e.g. "CC8D". */
  code: string;
  type: RoomType;
  category?: RoomCategory;
  location?: string;
  notes?: string;
}

/** W1 = Monday ... W7 = Sunday. */
export type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEK_DAYS: WeekDay[] = [1, 2, 3, 4, 5, 6, 7];

/** 24h "HHMM" string, zero-padded, e.g. "0800", "1230". */
export type HHMM = string;

export interface TimeRange {
  start: HHMM;
  end: HHMM;
}

export interface TimetableEntry {
  roomCode: string;
  day: WeekDay;
  range: TimeRange;
}

export interface EventWindow extends TimeRange {
  /** Whether aircon use is enabled during this window. */
  enabled: boolean;
}

export interface EventEntry {
  /** e.g. "E1". */
  eventId: string;
  name?: string;
  /** "YYYYMMDD". */
  date: string;
  /** A room code, or "ALL" to apply to every room. */
  roomCode: string;
  windows: EventWindow[];
}

export interface Tracker {
  roomCode: string;
  chatId: string;
  label?: string;
}

/** Fully resolved, per-room data ready to be serialized into a UDP packet. */
export interface RoomSchedule {
  room: Room;
  /**
   * Sorted ranges per day. Every room has one — `special` rooms use their
   * own Timetable rows, `general` rooms all share the "DEFAULT" schedule
   * (see DEFAULT_TIMETABLE_CODE in src/excel/excelParser.ts).
   */
  weekly: Record<WeekDay, TimeRange[]>;
  events: EventEntry[];
  trackers: Tracker[];
}

export interface ParsedTimetable {
  rooms: Room[];
  timetable: TimetableEntry[];
  events: EventEntry[];
  trackers: Tracker[];
}
