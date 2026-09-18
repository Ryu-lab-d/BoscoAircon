import { WorkBook } from 'xlsx';
import { Tracker } from '../types/timetable';
import { firstSheetRows, optionalString, requireString } from './xlsxUtil';

const SHEET_NAME = 'Trackers';

/** Columns: RoomCode, ChatID, optional Label. */
export function parseTrackers(workbook: WorkBook): Tracker[] {
  const rows = firstSheetRows(workbook);

  return rows.map((row, i) => {
    const rowNum = i + 2;
    return {
      roomCode: requireString(row, 'RoomCode', SHEET_NAME, rowNum),
      chatId: requireString(row, 'ChatID', SHEET_NAME, rowNum),
      label: optionalString(row, 'Label'),
    };
  });
}
