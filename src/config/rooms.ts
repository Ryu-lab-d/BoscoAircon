import { EventWindow, Room, WeekDay } from '../types/timetable';

/** The 11 regular homeroom class codes — each has its own room "CC" + code. */
export const REGULAR_CLASS_CODES = [
  '7A', '7B', '7C', '7D',
  '8A', '8B', '8C', '8D',
  '9A', '9B', '9C',
] as const;

export type RegularClassCode = (typeof REGULAR_CLASS_CODES)[number];

/** Grades whose "Social Studies" period routes to CCMultimedia instead of staying in the home room. */
export const MULTIMEDIA_SOCIAL_STUDIES_CLASSES: readonly string[] = ['8A', '8B', '8C', '8D'];

/** The 13 special (non-regular) rooms, each with its own independently-tracked weekly schedule. */
export const SPECIAL_ROOM_CODES = [
  'CCComputer',
  'CCMakerspace',
  'CCLab',
  'CCSmartBoard',
  'CCAcedemic',
  'CCActivity',
  'CCRobotics',
  'CCPhotography',
  'CCMultimedia',
  'CCArt',
  'CCPresentation',
  'CCLibrary',
  'CCDrama',
] as const;

export type SpecialRoomCode = (typeof SPECIAL_ROOM_CODES)[number];

/** Fixed subject -> special room routing that RoomMappingRules can't override. */
export const FIXED_SUBJECT_ROOMS: Record<'art' | 'computer' | 'multimedia', SpecialRoomCode> = {
  art: 'CCArt',
  computer: 'CCComputer',
  multimedia: 'CCMultimedia',
};

/** Default RoomMappingRules target for "Project" when no rule overrides it. */
export const DEFAULT_PROJECT_ROOM: SpecialRoomCode = 'CCLab';

export function homeRoomCode(classCode: string): string {
  return `CC${classCode}`;
}

/** A regular room's hardcoded allowed hours — matches microbit/general.ts's DEFAULT_HOURS exactly. */
export const DEFAULT_HOURS: EventWindow[] = [
  { start: '0800', end: '1140', enabled: true },
  { start: '1230', end: '1620', enabled: true },
];

export const ALL_ROOMS: Room[] = [
  ...REGULAR_CLASS_CODES.map(
    (code): Room => ({
      code: homeRoomCode(code),
      type: 'general',
      category: 'classroom',
    }),
  ),
  ...SPECIAL_ROOM_CODES.map((code): Room => ({ code, type: 'special', category: 'other' })),
];

export const ALL_ROOM_CODES: string[] = ALL_ROOMS.map(r => r.code);

export function emptyWeekly(): Record<WeekDay, EventWindow[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}
