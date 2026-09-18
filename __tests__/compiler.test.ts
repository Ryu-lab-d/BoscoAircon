/**
 * @format
 */
import * as XLSX from 'xlsx';
import { compileSchedules } from '../src/excel/compiler';
import { parseRoomMappingRules } from '../src/excel/timetableCompiler';
import { parseSpecialEvents } from '../src/excel/specialEvents';
import { parseTrackers } from '../src/excel/trackers';
import { parseHolidays } from '../src/excel/holidays';
import { buildRoomPacket } from '../src/udp/udpProtocol';
import { ALL_ROOM_CODES } from '../src/config/rooms';

function workbook(rows: Record<string, unknown>[], sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  return wb;
}

describe('compileSchedules — end to end', () => {
  it('produces a schedule for every known room, timetable-only', () => {
    const timetable = workbook([
      { Teacher: 'Mr. A', Day: 'Monday', TimeSlot: '10.00-10.50', RoomOrClass: '8A Project' },
    ]);
    const { schedules, warnings } = compileSchedules({ timetable });

    expect(warnings).toEqual([]);
    expect(schedules.map(s => s.room.code).sort()).toEqual([...ALL_ROOM_CODES].sort());

    const cc8a = schedules.find(s => s.room.code === 'CC8A')!;
    expect(buildRoomPacket(cc8a)).toBe('CC8A|WD1|1000-1050N');

    const lab = schedules.find(s => s.room.code === 'CCLab')!;
    expect(buildRoomPacket(lab)).toBe('CCLab|WD1|1000-1050|WD2|WD3|WD4|WD5|WD6|WD7');
  });

  it('layers RoomMappingRules, SpecialEvents, Trackers, and Holidays on top of the derived weekly schedule', () => {
    const timetable = workbook([
      { Teacher: 'Mr. A', Day: 'Monday', TimeSlot: '10.00-10.50', RoomOrClass: '8A Project' },
    ]);
    const roomMappingRules = parseRoomMappingRules(
      workbook([{ ClassCode: '8A', Subject: 'Project', RoomCode: 'CCRobotics' }]),
    );
    const specialEvents = parseSpecialEvents(
      workbook([
        { RoomCode: 'ALL', Date: '20260908', StartTime: '1200', EndTime: '1300', Enabled: 'N', EventName: 'Sports Day' },
        { RoomCode: 'CCRobotics', Date: '20260910', StartTime: '0900', EndTime: '1130', Enabled: 'Y', EventName: '' },
      ]),
    );
    const trackers = parseTrackers(workbook([{ RoomCode: 'CCRobotics', ChatID: '111111111', Label: 'Teacher' }]));
    const holidays = parseHolidays(workbook([{ StartDate: '20261001', EndDate: '20261101', Label: 'Term break' }]));

    const { schedules } = compileSchedules({ timetable, roomMappingRules, specialEvents, trackers, holidays });

    const robotics = schedules.find(s => s.room.code === 'CCRobotics')!;
    expect(buildRoomPacket(robotics)).toBe(
      'CCRobotics|WD1|1000-1050|WD2|WD3|WD4|WD5|WD6|WD7' +
        '|E|20260908|1200-1300N|20260910|0900-1130Y' +
        '|H|20261001-20261101' +
        '|T|111111111',
    );

    // The default CCLab never got the override, since the RoomMappingRules
    // row sent this class's Project period to CCRobotics instead — it still
    // gets the ALL event and the building-wide holiday, just no weekly windows.
    const lab = schedules.find(s => s.room.code === 'CCLab')!;
    expect(buildRoomPacket(lab)).toBe(
      'CCLab|WD1|WD2|WD3|WD4|WD5|WD6|WD7|E|20260908|1200-1300N|H|20261001-20261101',
    );
  });
});
