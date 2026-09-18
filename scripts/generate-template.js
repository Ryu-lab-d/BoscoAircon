/**
 * Regenerates templates/BoscoAircon_Timetable_Template.xlsx from scratch.
 * Run with: node scripts/generate-template.js
 */
const path = require('path');
const XLSX = require('xlsx');

const rooms = [
  { RoomCode: 'CC8D', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 8', Notes: '' },
  { RoomCode: 'CC8A', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 8', Notes: '' },
  { RoomCode: 'CC8B', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 8', Notes: '' },
  { RoomCode: 'CC8C', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 8', Notes: '' },
  { RoomCode: 'CC7A', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 7', Notes: '' },
  { RoomCode: 'CC7B', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 7', Notes: '' },
  { RoomCode: 'CC7C', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 7', Notes: '' },
  { RoomCode: 'CC7D', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 7', Notes: '' },
  { RoomCode: 'CC9A', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 9', Notes: '' },
  { RoomCode: 'CC9B', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 9', Notes: '' },
  { RoomCode: 'CC9C', RoomType: 'general', Category: 'classroom', Location: 'Block C, Level 9', Notes: '' },
  { RoomCode: 'CCLibrary', RoomType: 'special', Category: 'other', Location: 'Block C, Library', Notes: '' },
  { RoomCode: 'CCCom', RoomType: 'special', Category: 'other', Location: 'Block C, Computer Lab', Notes: '' },
  { RoomCode: 'CCPresent', RoomType: 'special', Category: 'other', Location: 'Block C, Presentation Room', Notes: '' },
];

// Every room has aircon. "DEFAULT" rows define the one shared schedule all
// `general` classrooms use (standard school hours, lunch break off) so it
// isn't repeated 11 times. `special` rooms (the three shared spaces below)
// list their own rows under their own RoomCode because their hours differ.
const timetable = [
  { RoomCode: 'DEFAULT', Day: 'W1', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'DEFAULT', Day: 'W1', StartTime: '1300', EndTime: '1600' },
  { RoomCode: 'DEFAULT', Day: 'W2', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'DEFAULT', Day: 'W2', StartTime: '1300', EndTime: '1600' },
  { RoomCode: 'DEFAULT', Day: 'W3', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'DEFAULT', Day: 'W3', StartTime: '1300', EndTime: '1600' },
  { RoomCode: 'DEFAULT', Day: 'W4', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'DEFAULT', Day: 'W4', StartTime: '1300', EndTime: '1600' },
  { RoomCode: 'DEFAULT', Day: 'W5', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'DEFAULT', Day: 'W5', StartTime: '1300', EndTime: '1600' },
  { RoomCode: 'CCLibrary', Day: 'W1', StartTime: '0800', EndTime: '1000' },
  { RoomCode: 'CCLibrary', Day: 'W1', StartTime: '1050', EndTime: '1230' },
  { RoomCode: 'CCLibrary', Day: 'W1', StartTime: '1400', EndTime: '1600' },
  { RoomCode: 'CCLibrary', Day: 'W2', StartTime: '0800', EndTime: '1200' },
  { RoomCode: 'CCCom', Day: 'W1', StartTime: '0900', EndTime: '1100' },
];

const events = [
  { EventID: 'E1', EventName: 'Sports Day', Date: '20260908', RoomCode: 'ALL', StartTime: '1200', EndTime: '1300', Enabled: 'N' },
  { EventID: 'E1', EventName: 'Sports Day', Date: '20260908', RoomCode: 'ALL', StartTime: '1400', EndTime: '1500', Enabled: 'N' },
  { EventID: 'E2', EventName: 'Exam Block', Date: '20260910', RoomCode: 'CCLibrary', StartTime: '0900', EndTime: '1130', Enabled: 'Y' },
];

const trackers = [
  { RoomCode: 'CC8D', ChatID: '111111111', Label: 'Homeroom Teacher' },
  { RoomCode: 'CC8D', ChatID: '222222222', Label: 'Admin Office' },
  { RoomCode: 'CCLibrary', ChatID: '333333333', Label: 'Librarian' },
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rooms), 'Rooms');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(timetable), 'Timetable');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(events), 'Events');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trackers), 'Trackers');

const outPath = path.join(__dirname, '..', 'templates', 'BoscoAircon_Timetable_Template.xlsx');
XLSX.writeFile(workbook, outPath);
console.log('Wrote', outPath);
