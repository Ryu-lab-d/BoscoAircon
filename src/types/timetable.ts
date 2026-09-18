/**
 * Domain model for the BoscoAircon "Nexus" system (protocol v2).
 * See docs/superpowers/specs/2026-09-18-course-timetable-compiler-design.md
 * for the Excel schema and derivation rules this model is built from, and
 * microbit/general.ts / microbit/ungeneral.ts for the firmware that parses
 * the wire format this is serialized to.
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

/** A time window with an explicit on/off flag — the unit both weekly overrides and event windows are made of. */
export interface EventWindow extends TimeRange {
  enabled: boolean;
}

/** One day's event override windows, keyed by date so the firmware (and eventFilter) can match "today". */
export interface RoomEventDay {
  /** "YYYYMMDD". */
  date: string;
  windows: EventWindow[];
}

/** A building-wide date range during which aircon is never scheduled on, for every room. */
export interface Holiday {
  /** "YYYYMMDD". */
  start: string;
  /** "YYYYMMDD". */
  end: string;
  label?: string;
}

export interface Tracker {
  roomCode: string;
  chatId: string;
  label?: string;
}

/** A RoomMappingRules row: overrides where a class's "Project" period routes to. */
export interface RoomMappingRule {
  /** A specific class code (e.g. "8A"), or "ALL". */
  classCode: string;
  /** Currently only "Project" is meaningful. */
  subject: string;
  roomCode: string;
}

/** A raw SpecialEvents row, before grouping by room/date into RoomEventDay. */
export interface SpecialEventRow {
  /** A specific room code, or "ALL". */
  roomCode: string;
  /** "YYYYMMDD". */
  date: string;
  window: EventWindow;
  name?: string;
}

/**
 * Fully resolved, per-room data ready to be serialized into a UDP packet.
 *
 * `weekly` holds different things for the two room types:
 * - `special` rooms: their own additive "on" windows, derived from every
 *   class routed there (Project/Art/Computer/Social Studies periods).
 * - `general` rooms: only the *override* windows layered on top of the
 *   firmware's hardcoded default hours (usually `enabled: false`, to vacate
 *   the room while its class is elsewhere) — a day with no overrides has an
 *   empty array here, meaning "just use the default hours all day".
 */
export interface RoomSchedule {
  room: Room;
  weekly: Record<WeekDay, EventWindow[]>;
  events: RoomEventDay[];
  holidays: Holiday[];
  trackers: Tracker[];
}
