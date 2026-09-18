import { WorkBook } from 'xlsx';
import { Holiday } from '../types/timetable';
import { firstSheetRows, optionalString, parseDateCode, requireString } from './xlsxUtil';

const SHEET_NAME = 'Holidays';

/** Columns: StartDate (YYYYMMDD), EndDate (YYYYMMDD), optional Label. Applies building-wide. */
export function parseHolidays(workbook: WorkBook): Holiday[] {
  const rows = firstSheetRows(workbook);

  return rows.map((row, i) => {
    const rowNum = i + 2;
    const start = parseDateCode(requireString(row, 'StartDate', SHEET_NAME, rowNum), SHEET_NAME, rowNum, 'StartDate');
    const end = parseDateCode(requireString(row, 'EndDate', SHEET_NAME, rowNum), SHEET_NAME, rowNum, 'EndDate');
    if (end < start) {
      throw new Error(`${SHEET_NAME} row ${rowNum}: EndDate "${end}" is before StartDate "${start}"`);
    }
    return { start, end, label: optionalString(row, 'Label') };
  });
}
