/**
 * @format
 */
import * as XLSX from 'xlsx';
import {
  classifySubject,
  compileWeeklyOverrides,
  extractClassAndSubject,
  parseRawTimetableRows,
} from '../src/excel/timetableCompiler';
import { RoomMappingRule } from '../src/types/timetable';

function timetableWorkbook(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'bosco_occupancy.csv');
  return workbook;
}

function row(day: string, timeSlot: string, roomOrClass: string, teacher = 'Mr. Test') {
  return { Teacher: teacher, Day: day, TimeSlot: timeSlot, RoomOrClass: roomOrClass, Note: '' };
}

describe('extractClassAndSubject', () => {
  it('splits a class code with a subject suffix', () => {
    expect(extractClassAndSubject('8A Project')).toEqual({ classCode: '8A', subject: 'Project' });
  });

  it('treats a bare class code as having no subject', () => {
    expect(extractClassAndSubject('7B')).toEqual({ classCode: '7B', subject: '' });
  });

  it('tolerates a stray trailing character (real data has "7D\'")', () => {
    expect(extractClassAndSubject("7D'")).toEqual({ classCode: '7D', subject: "'" });
  });

  it('returns null for a row with no recognizable class code (M.I. periods)', () => {
    expect(extractClassAndSubject('Y7-8 MI')).toBeNull();
    expect(extractClassAndSubject('Y9-12 MI')).toBeNull();
  });
});

describe('classifySubject', () => {
  it('treats a blank subject as the default (home room, no override)', () => {
    expect(classifySubject('', '7A')).toEqual({ kind: 'default' });
  });

  it('treats ordinary academic subjects as default, typos included', () => {
    expect(classifySubject('Sci', '7A')).toEqual({ kind: 'default' });
    expect(classifySubject('Gramamr', '7A')).toEqual({ kind: 'default' });
    expect(classifySubject('Supp Math', '9C')).toEqual({ kind: 'default' });
  });

  it('skips M.I. entirely', () => {
    expect(classifySubject('MI', '7A')).toEqual({ kind: 'skip' });
    expect(classifySubject('M.I.', '7A')).toEqual({ kind: 'skip' });
  });

  it('vacates for PE and Music with no destination', () => {
    expect(classifySubject('P.E.', '7A')).toEqual({ kind: 'vacate' });
    expect(classifySubject('Music', '7A')).toEqual({ kind: 'vacate' });
  });

  it('routes Project/Art/Computer', () => {
    expect(classifySubject('Project', '8A')).toEqual({ kind: 'route', subjectKey: 'project' });
    expect(classifySubject('Art', '8A')).toEqual({ kind: 'route', subjectKey: 'art' });
    expect(classifySubject('Computer', '8A')).toEqual({ kind: 'route', subjectKey: 'computer' });
  });

  it('routes Social Studies to Multimedia only for grades 8A-8D', () => {
    expect(classifySubject('Social', '8A')).toEqual({ kind: 'route', subjectKey: 'multimedia' });
    expect(classifySubject('Social', '7A')).toEqual({ kind: 'default' });
    expect(classifySubject('Social', '9C')).toEqual({ kind: 'default' });
  });
});

describe('parseRawTimetableRows', () => {
  it('parses the real dot-separated time format and full day names', () => {
    const wb = timetableWorkbook([row('Monday', '8.00-8.50', '7A Sci')]);
    const { entries, warnings } = parseRawTimetableRows(wb);
    expect(warnings).toEqual([]);
    expect(entries).toEqual([{ day: 1, start: '0800', end: '0850', classCode: '7A', subject: 'Sci' }]);
  });

  it('silently drops M.I. rows without a warning (they are not a data problem)', () => {
    const wb = timetableWorkbook([row('Thursday', '12.30-13.20', 'Y7-8 MI', 'Mr. X')]);
    const { entries, warnings } = parseRawTimetableRows(wb);
    expect(entries).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('warns and skips a row with an unrecognized day or time format', () => {
    const wb = timetableWorkbook([
      row('Funday', '8.00-8.50', '7A Sci'),
      row('Monday', '8:00-8:50', '7A Sci'),
    ]);
    const { entries, warnings } = parseRawTimetableRows(wb);
    expect(entries).toEqual([]);
    expect(warnings).toHaveLength(2);
  });
});

describe('compileWeeklyOverrides', () => {
  it('vacates the home room with no destination for PE', () => {
    const wb = timetableWorkbook([row('Monday', '8.00-8.50', '7A P.E.')]);
    const { weeklyByRoom } = compileWeeklyOverrides(wb, []);
    expect(weeklyByRoom.get('CC7A')![1]).toEqual([{ start: '0800', end: '0850', enabled: false }]);
    expect(weeklyByRoom.has('CCLab')).toBe(false);
  });

  it('routes Project to the default room (CCLab) and vacates the home room', () => {
    const wb = timetableWorkbook([row('Monday', '10.00-10.50', '8A Project')]);
    const { weeklyByRoom } = compileWeeklyOverrides(wb, []);
    expect(weeklyByRoom.get('CC8A')![1]).toEqual([{ start: '1000', end: '1050', enabled: false }]);
    expect(weeklyByRoom.get('CCLab')![1]).toEqual([{ start: '1000', end: '1050', enabled: true }]);
  });

  it('honors a class-specific RoomMappingRules override for Project over the ALL/default rule', () => {
    const wb = timetableWorkbook([row('Monday', '10.00-10.50', '8A Project')]);
    const rules: RoomMappingRule[] = [
      { classCode: 'ALL', subject: 'Project', roomCode: 'CCMakerspace' },
      { classCode: '8A', subject: 'Project', roomCode: 'CCRobotics' },
    ];
    const { weeklyByRoom } = compileWeeklyOverrides(wb, rules);
    expect(weeklyByRoom.get('CCRobotics')![1]).toEqual([{ start: '1000', end: '1050', enabled: true }]);
    expect(weeklyByRoom.has('CCMakerspace')).toBe(false);
  });

  it('merges a genuine back-to-back double period into one continuous window', () => {
    const wb = timetableWorkbook([
      row('Monday', '8.00-8.50', '8A Project'),
      row('Monday', '8.50-9.40', '8A Project'),
    ]);
    const { weeklyByRoom } = compileWeeklyOverrides(wb, []);
    expect(weeklyByRoom.get('CCLab')![1]).toEqual([{ start: '0800', end: '0940', enabled: true }]);
    expect(weeklyByRoom.get('CC8A')![1]).toEqual([{ start: '0800', end: '0940', enabled: false }]);
  });

  it('does not merge two periods separated by a break', () => {
    const wb = timetableWorkbook([
      row('Monday', '13.20-14.10', '8A Project'),
      row('Monday', '14.30-15.20', '8A Project'),
    ]);
    const { weeklyByRoom } = compileWeeklyOverrides(wb, []);
    expect(weeklyByRoom.get('CCLab')![1]).toEqual([
      { start: '1320', end: '1410', enabled: true },
      { start: '1430', end: '1520', enabled: true },
    ]);
  });

  it('leaves ordinary subjects with no override at all', () => {
    const wb = timetableWorkbook([row('Monday', '8.00-8.50', '7A Sci')]);
    const { weeklyByRoom } = compileWeeklyOverrides(wb, []);
    expect(weeklyByRoom.size).toBe(0);
  });
});
