/**
 * @format
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildRoomSchedules, parseTimetableWorkbook } from '../src/excel/excelParser';
import { buildRoomPacket } from '../src/udp/udpProtocol';
import { filterSchedulesForDate, toDateCode } from '../src/udp/eventFilter';

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'BoscoAircon_Timetable_Template.xlsx');

function loadTemplate() {
  const buffer = fs.readFileSync(TEMPLATE_PATH);
  return parseTimetableWorkbook(buffer);
}

test('parses the template workbook into four tables', () => {
  const parsed = loadTemplate();
  expect(parsed.rooms.map(r => r.code)).toEqual([
    'CC8D', 'CC8A', 'CC8B', 'CC8C',
    'CC7A', 'CC7B', 'CC7C', 'CC7D',
    'CC9A', 'CC9B', 'CC9C',
    'CCLibrary', 'CCCom', 'CCPresent',
  ]);
  // 10 DEFAULT rows (shared by every general room) + 4 CCLibrary + 1 CCCom.
  expect(parsed.timetable.length).toBe(15);
  // 3 Events rows collapse into 2 entries: E1/ALL's two windows merge into one entry.
  expect(parsed.events.length).toBe(2);
  expect(parsed.trackers.length).toBe(3);
});

test('builds a special room packet with multiple daily windows and events', () => {
  const parsed = loadTemplate();
  const schedules = buildRoomSchedules(parsed);
  // CCLibrary is one of the three special (aircon) rooms in the template.
  const library = schedules.find(s => s.room.code === 'CCLibrary')!;

  const packet = buildRoomPacket(library);
  const fields = packet.split('|');

  expect(fields[0]).toBe('CCLibrary');
  // WD1 has three windows, in chronological order.
  expect(fields.slice(1, 6)).toEqual(['WD1', '0800-1000', '1050-1230', '1400-1600', 'WD2']);
  // WD2 has one window, then WD3 (empty) follows immediately.
  expect(fields[6]).toBe('0800-1200');
  expect(fields[7]).toBe('WD3');
  // Events section: ALL event E1 (two windows) applies here, plus room-specific E2.
  expect(packet).toContain('E1|20260908|1200-1300N|1400-1500N');
  expect(packet).toContain('E2|20260910|0900-1130Y');
  // Trackers section trails the packet.
  expect(packet.endsWith('T|333333333')).toBe(true);
});

test('a special room with no Timetable rows and no trackers omits both sections', () => {
  const parsed = loadTemplate();
  const schedules = buildRoomSchedules(parsed);
  // CCPresent has no Timetable rows and no Trackers rows in the template,
  // but still inherits the ALL event E1.
  const present = schedules.find(s => s.room.code === 'CCPresent')!;

  const packet = buildRoomPacket(present);

  expect(packet).toBe('CCPresent|WD1|WD2|WD3|WD4|WD5|WD6|WD7|E1|20260908|1200-1300N|1400-1500N');
});

test('a general room inherits the shared DEFAULT weekly schedule', () => {
  const parsed = loadTemplate();
  const schedules = buildRoomSchedules(parsed);
  // CC8D is a general classroom — it has no Timetable rows of its own, so
  // it inherits the DEFAULT schedule (Mon-Fri 0800-1200, 1300-1600), plus
  // its own trackers and the inherited ALL event.
  const cc8d = schedules.find(s => s.room.code === 'CC8D')!;

  const packet = buildRoomPacket(cc8d);

  expect(packet).toBe(
    'CC8D|WD1|0800-1200|1300-1600|WD2|0800-1200|1300-1600|WD3|0800-1200|1300-1600' +
      '|WD4|0800-1200|1300-1600|WD5|0800-1200|1300-1600|WD6|WD7' +
      '|E1|20260908|1200-1300N|1400-1500N|T|111111111|222222222',
  );
});

test('every general room shares the exact same weekly schedule', () => {
  const parsed = loadTemplate();
  const schedules = buildRoomSchedules(parsed);
  const generalRooms = schedules.filter(s => s.room.type === 'general');

  expect(generalRooms.length).toBeGreaterThan(1);
  const [first, ...rest] = generalRooms;
  for (const room of rest) {
    expect(room.weekly).toEqual(first.weekly);
  }
});

test('rejects a general room with a weekly Timetable row', () => {
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'GEN1', RoomType: 'general', Category: '', Location: '', Notes: '' }]),
    'Rooms',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'GEN1', Day: 'W1', StartTime: '0800', EndTime: '0900' }]),
    'Timetable',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  expect(() => parseTimetableWorkbook(buffer)).toThrow(/general room/);
});

test('rejects an EventID reused for both "ALL" and a specific room', () => {
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'GEN1', RoomType: 'general', Category: '', Location: '', Notes: '' }]),
    'Rooms',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { EventID: 'E1', EventName: '', Date: '20260908', RoomCode: 'ALL', StartTime: '1200', EndTime: '1300', Enabled: 'N' },
      { EventID: 'E1', EventName: '', Date: '20260908', RoomCode: 'GEN1', StartTime: '1400', EndTime: '1500', Enabled: 'Y' },
    ]),
    'Events',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  expect(() => parseTimetableWorkbook(buffer)).toThrow(/already used with RoomCode "ALL"/);
});

test('rejects an EventID reused with an inconsistent EventName', () => {
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'GEN1', RoomType: 'general', Category: '', Location: '', Notes: '' }]),
    'Rooms',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { EventID: 'E1', EventName: 'Sports Day', Date: '20260908', RoomCode: 'GEN1', StartTime: '1200', EndTime: '1300', Enabled: 'N' },
      { EventID: 'E1', EventName: 'Sports Day (Rescheduled)', Date: '20260908', RoomCode: 'GEN1', StartTime: '1400', EndTime: '1500', Enabled: 'Y' },
    ]),
    'Events',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  expect(() => parseTimetableWorkbook(buffer)).toThrow(/inconsistent EventName/);
});

test('backfills EventName from a later row when the first row left it blank', () => {
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'GEN1', RoomType: 'general', Category: '', Location: '', Notes: '' }]),
    'Rooms',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { EventID: 'E1', EventName: '', Date: '20260908', RoomCode: 'GEN1', StartTime: '1200', EndTime: '1300', Enabled: 'N' },
      { EventID: 'E1', EventName: 'Sports Day', Date: '20260908', RoomCode: 'GEN1', StartTime: '1400', EndTime: '1500', Enabled: 'Y' },
    ]),
    'Events',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const parsed = parseTimetableWorkbook(buffer);
  expect(parsed.events[0].name).toBe('Sports Day');
});

test('toDateCode formats a date as zero-padded YYYYMMDD', () => {
  expect(toDateCode(new Date(2026, 8, 8))).toBe('20260908'); // month is 0-indexed
  expect(toDateCode(new Date(2026, 0, 5))).toBe('20260105');
});

test('filterSchedulesForDate drops events that do not match the given date, keeping the weekly schedule', () => {
  const parsed = loadTemplate();
  const schedules = buildRoomSchedules(parsed);
  const library = schedules.find(s => s.room.code === 'CCLibrary')!;
  expect(library.events.length).toBeGreaterThan(0);

  const [onEventDate] = filterSchedulesForDate([library], '20260908');
  expect(onEventDate.events.map(e => e.eventId)).toEqual(['E1']);
  expect(onEventDate.weekly).toEqual(library.weekly);

  const [onUnrelatedDate] = filterSchedulesForDate([library], '20990101');
  expect(onUnrelatedDate.events).toEqual([]);
  expect(onUnrelatedDate.weekly).toEqual(library.weekly);
});

test('zero-padded HHMM times survive Excel storing them as plain numbers', () => {
  // Excel stores a cell like "0030" as the number 30 unless the column is
  // formatted as text, so sheet_to_json hands the parser "30", not "0030".
  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'SP1', RoomType: 'special', Category: '', Location: '', Notes: '' }]),
    'Rooms',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ RoomCode: 'SP1', Day: 'W1', StartTime: 0, EndTime: 30 }]),
    'Timetable',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const parsed = parseTimetableWorkbook(buffer);
  expect(parsed.timetable[0].range).toEqual({ start: '0000', end: '0030' });

  const schedules = buildRoomSchedules(parsed);
  const packet = buildRoomPacket(schedules[0]);
  expect(packet).toBe('SP1|WD1|0000-0030|WD2|WD3|WD4|WD5|WD6|WD7');
});
