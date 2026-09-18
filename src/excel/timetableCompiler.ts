import { WorkBook } from 'xlsx';
import { EventWindow, RoomMappingRule, WeekDay } from '../types/timetable';
import {
  DEFAULT_PROJECT_ROOM,
  FIXED_SUBJECT_ROOMS,
  MULTIMEDIA_SOCIAL_STUDIES_CLASSES,
  REGULAR_CLASS_CODES,
  emptyWeekly,
  homeRoomCode,
} from '../config/rooms';
import { firstSheetRows, optionalString, requireString } from './xlsxUtil';

const DAY_NAME_TO_NUM: Record<string, WeekDay> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

// The school's raw export writes times as "H.MM-H.MM" or "HH.MM-HH.MM"
// (dot-separated, e.g. "8.00-8.50", "10.00-10.50") — convert to the app's
// zero-padded "HHMM-HHMM".
const RAW_TIME_SLOT_RE = /^(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})$/;

export interface TimetableWarning {
  row: number;
  message: string;
}

interface RawEntry {
  day: WeekDay;
  start: string;
  end: string;
  classCode: string;
  subject: string;
}

/**
 * Splits a "RoomOrClass" cell like "8A Project" or bare "7B" into its class
 * code and subject. Real exports have typos in the subject text ("Gramamr",
 * a stray extra letter in "9CB Social") — harmless, since anything that
 * isn't one of the handful of special-cased subjects in classifySubject()
 * falls through to "default" (home room, no override) regardless of exact
 * spelling. Returns null for rows with no recognizable class code at all
 * (e.g. "Y7-8 MI", "Y9-12 MI") — those are M.I. periods spread across
 * rooms this system doesn't track, and are skipped entirely.
 */
export function extractClassAndSubject(roomOrClass: string): { classCode: string; subject: string } | null {
  const trimmed = roomOrClass.trim();
  for (const code of REGULAR_CLASS_CODES) {
    if (trimmed.indexOf(code) === 0) {
      return { classCode: code, subject: trimmed.slice(code.length).trim() };
    }
  }
  return null;
}

function parseRawTimeSlot(raw: string): { start: string; end: string } | null {
  const match = RAW_TIME_SLOT_RE.exec(raw.trim());
  if (!match) {
    return null;
  }
  return {
    start: match[1].padStart(2, '0') + match[2],
    end: match[3].padStart(2, '0') + match[4],
  };
}

export type SubjectAction =
  | { kind: 'default' }
  | { kind: 'skip' }
  | { kind: 'vacate' }
  | { kind: 'route'; subjectKey: 'project' | 'art' | 'computer' | 'multimedia' };

/** The subject -> room-action table from the design doc. Case/whitespace-insensitive. */
export function classifySubject(rawSubject: string, classCode: string): SubjectAction {
  const s = rawSubject.trim().toLowerCase().replace(/\s+/g, ' ');

  if (s === '') {
    return { kind: 'default' };
  }
  if (s === 'mi' || s === 'm.i.' || s === 'm.i') {
    return { kind: 'skip' };
  }
  if (s === 'pe' || s === 'p.e.' || s === 'p.e') {
    return { kind: 'vacate' };
  }
  if (s === 'music') {
    return { kind: 'vacate' };
  }
  if (s === 'project') {
    return { kind: 'route', subjectKey: 'project' };
  }
  if (s === 'art') {
    return { kind: 'route', subjectKey: 'art' };
  }
  if (s === 'computer') {
    return { kind: 'route', subjectKey: 'computer' };
  }
  if (s.indexOf('social') === 0 || s.indexOf('สังคม') === 0) {
    if (MULTIMEDIA_SOCIAL_STUDIES_CLASSES.indexOf(classCode) !== -1) {
      return { kind: 'route', subjectKey: 'multimedia' };
    }
    return { kind: 'default' };
  }
  return { kind: 'default' };
}

function resolveProjectRoom(classCode: string, rules: RoomMappingRule[]): string {
  const classSpecific = rules.find(r => r.subject.toLowerCase() === 'project' && r.classCode === classCode);
  if (classSpecific) {
    return classSpecific.roomCode;
  }
  const allRule = rules.find(r => r.subject.toLowerCase() === 'project' && r.classCode === 'ALL');
  return allRule ? allRule.roomCode : DEFAULT_PROJECT_ROOM;
}

function destinationRoomFor(subjectKey: 'project' | 'art' | 'computer' | 'multimedia', classCode: string, rules: RoomMappingRule[]): string {
  if (subjectKey === 'project') {
    return resolveProjectRoom(classCode, rules);
  }
  return FIXED_SUBJECT_ROOMS[subjectKey];
}

/** Parses the raw flat sheet (Teacher | Day | TimeSlot | RoomOrClass | Note) into per-row entries, skipping rows that can't be interpreted. */
export function parseRawTimetableRows(workbook: WorkBook): { entries: RawEntry[]; warnings: TimetableWarning[] } {
  const rows = firstSheetRows(workbook);
  const entries: RawEntry[] = [];
  const warnings: TimetableWarning[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const dayRaw = optionalString(row, 'Day');
    const timeSlotRaw = optionalString(row, 'TimeSlot');
    const roomOrClassRaw = optionalString(row, 'RoomOrClass');

    if (!dayRaw || !timeSlotRaw || !roomOrClassRaw) {
      warnings.push({ row: rowNum, message: 'missing Day, TimeSlot, or RoomOrClass — skipped' });
      return;
    }

    const day = DAY_NAME_TO_NUM[dayRaw.trim().toLowerCase()];
    if (!day) {
      warnings.push({ row: rowNum, message: `unrecognized Day "${dayRaw}" — skipped` });
      return;
    }

    const time = parseRawTimeSlot(timeSlotRaw);
    if (!time) {
      warnings.push({ row: rowNum, message: `unrecognized TimeSlot "${timeSlotRaw}" — skipped` });
      return;
    }

    const split = extractClassAndSubject(roomOrClassRaw);
    if (!split) {
      // Not a recognizable class row at all (e.g. "Y7-8 MI") — this is the
      // M.I. skip-entirely case, not a data problem, so no warning.
      return;
    }

    entries.push({ day, start: time.start, end: time.end, classCode: split.classCode, subject: split.subject });
  });

  return { entries, warnings };
}

function mergeWindows(windows: EventWindow[]): EventWindow[] {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  const merged: EventWindow[] = [];

  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.enabled === w.enabled && w.start <= last.end) {
      if (w.end > last.end) {
        last.end = w.end;
      }
    } else {
      merged.push({ ...w });
    }
  }

  return merged;
}

/**
 * Derives per-room weekly override windows from the raw timetable, applying
 * the subject -> room-action rules (see classifySubject) and merging
 * adjacent/overlapping same-destination windows (the double-period case).
 *
 * Regular (home) rooms get vacate (enabled: false) windows only, for the
 * periods their class is routed elsewhere. Special rooms get additive "on"
 * (enabled: true) windows, aggregated from every class routed there.
 */
export function compileWeeklyOverrides(
  workbook: WorkBook,
  roomMappingRules: RoomMappingRule[],
): { weeklyByRoom: Map<string, Record<WeekDay, EventWindow[]>>; warnings: TimetableWarning[] } {
  const { entries, warnings } = parseRawTimetableRows(workbook);
  const raw = new Map<string, Record<WeekDay, EventWindow[]>>();

  function pushWindow(roomCode: string, day: WeekDay, start: string, end: string, enabled: boolean) {
    let weekly = raw.get(roomCode);
    if (!weekly) {
      weekly = emptyWeekly();
      raw.set(roomCode, weekly);
    }
    weekly[day].push({ start, end, enabled });
  }

  for (const entry of entries) {
    const action = classifySubject(entry.subject, entry.classCode);
    const homeRoom = homeRoomCode(entry.classCode);

    if (action.kind === 'default' || action.kind === 'skip') {
      continue;
    }
    if (action.kind === 'vacate') {
      pushWindow(homeRoom, entry.day, entry.start, entry.end, false);
      continue;
    }
    // action.kind === 'route'
    const destination = destinationRoomFor(action.subjectKey, entry.classCode, roomMappingRules);
    pushWindow(homeRoom, entry.day, entry.start, entry.end, false);
    pushWindow(destination, entry.day, entry.start, entry.end, true);
  }

  const weeklyByRoom = new Map<string, Record<WeekDay, EventWindow[]>>();
  for (const [roomCode, weekly] of raw) {
    const mergedWeekly = emptyWeekly();
    for (const day of Object.keys(weekly).map(Number) as WeekDay[]) {
      mergedWeekly[day] = mergeWindows(weekly[day]);
    }
    weeklyByRoom.set(roomCode, mergedWeekly);
  }

  return { weeklyByRoom, warnings };
}

export function parseRoomMappingRules(workbook: WorkBook): RoomMappingRule[] {
  const rows = firstSheetRows(workbook);
  const sheet = 'RoomMappingRules';
  return rows.map((row, i) => {
    const rowNum = i + 2;
    return {
      classCode: requireString(row, 'ClassCode', sheet, rowNum),
      subject: requireString(row, 'Subject', sheet, rowNum),
      roomCode: requireString(row, 'RoomCode', sheet, rowNum),
    };
  });
}
