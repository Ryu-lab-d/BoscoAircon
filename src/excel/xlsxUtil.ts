import { read, utils, WorkBook } from 'xlsx';

export class SheetParseError extends Error {}

export function fail(sheet: string, row: number, message: string): never {
  throw new SheetParseError(`${sheet} row ${row}: ${message}`);
}

/** Reads a workbook from a base64 string, the encoding `react-native-fs`'s readFile() returns. */
export function readWorkbookFromBase64(base64: string): WorkBook {
  return read(base64, { type: 'base64' });
}

/** Reads a workbook from a buffer/array (e.g. from Node's fs, in tests). */
export function readWorkbookFromBuffer(data: ArrayBuffer | Uint8Array): WorkBook {
  return read(data, { type: 'array' });
}

/**
 * Rows of the workbook's first sheet, whatever it's named — these imports
 * are always single-purpose single-sheet files (one xlsx per Timetable /
 * RoomMappingRules / SpecialEvents / Trackers / Holidays), so requiring an
 * exact sheet name would just be one more way for a user's export to fail
 * to import for no real reason.
 */
export function firstSheetRows(workbook: WorkBook): Record<string, unknown>[] {
  const name = workbook.SheetNames[0];
  if (!name) {
    return [];
  }
  return utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: '' });
}

export function requireString(row: Record<string, unknown>, key: string, sheet: string, rowNum: number): string {
  const value = row[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    fail(sheet, rowNum, `missing required column "${key}"`);
  }
  return String(value).trim();
}

export function optionalString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  return String(value).trim();
}

const HHMM_RE = /^([01]\d|2[0-3])[0-5]\d$/;

/**
 * Excel stores a cell like "0030" as the plain number 30 unless the column
 * is formatted as text, so sheet_to_json can hand us "30", "5", or "0" for
 * what's meant to be a zero-padded HHMM time — pad up to 4 digits from any
 * shorter length, not just 3.
 */
export function parseHHMM(raw: string, sheet: string, rowNum: number, field: string): string {
  const padded = raw.padStart(4, '0');
  if (!HHMM_RE.test(padded)) {
    fail(sheet, rowNum, `"${field}" must be a 24h HHMM time, got "${raw}"`);
  }
  return padded;
}

const DATE_RE = /^\d{8}$/;

export function parseDateCode(raw: string, sheet: string, rowNum: number, field: string): string {
  if (!DATE_RE.test(raw)) {
    fail(sheet, rowNum, `"${field}" must be YYYYMMDD, got "${raw}"`);
  }
  return raw;
}

export function parseEnabled(raw: string, sheet: string, rowNum: number): boolean {
  const upper = raw.toUpperCase();
  if (upper !== 'Y' && upper !== 'N') {
    fail(sheet, rowNum, `"Enabled" must be Y or N, got "${raw}"`);
  }
  return upper === 'Y';
}
