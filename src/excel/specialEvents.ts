import { WorkBook } from 'xlsx';
import { SpecialEventRow } from '../types/timetable';
import { firstSheetRows, optionalString, parseDateCode, parseEnabled, parseHHMM, requireString } from './xlsxUtil';

const SHEET_NAME = 'SpecialEvents';

/** Columns: RoomCode (or "ALL"), Date (YYYYMMDD), StartTime, EndTime, Enabled (Y/N), optional EventName. */
export function parseSpecialEvents(workbook: WorkBook): SpecialEventRow[] {
  const rows = firstSheetRows(workbook);

  return rows.map((row, i) => {
    const rowNum = i + 2;
    const roomCode = requireString(row, 'RoomCode', SHEET_NAME, rowNum);
    const date = parseDateCode(requireString(row, 'Date', SHEET_NAME, rowNum), SHEET_NAME, rowNum, 'Date');
    const start = parseHHMM(requireString(row, 'StartTime', SHEET_NAME, rowNum), SHEET_NAME, rowNum, 'StartTime');
    const end = parseHHMM(requireString(row, 'EndTime', SHEET_NAME, rowNum), SHEET_NAME, rowNum, 'EndTime');
    const enabled = parseEnabled(requireString(row, 'Enabled', SHEET_NAME, rowNum), SHEET_NAME, rowNum);
    const name = optionalString(row, 'EventName');

    return { roomCode, date, window: { start, end, enabled }, name };
  });
}
