/**
 * @format
 */
import { buildRoomPacket } from '../src/udp/udpProtocol';
import { RoomSchedule } from '../src/types/timetable';
import { emptyWeekly } from '../src/config/rooms';

function specialSchedule(overrides: Partial<RoomSchedule> = {}): RoomSchedule {
  return {
    room: { code: 'CCLab', type: 'special' },
    weekly: emptyWeekly(),
    events: [],
    holidays: [],
    trackers: [],
    ...overrides,
  };
}

function generalSchedule(overrides: Partial<RoomSchedule> = {}): RoomSchedule {
  return {
    room: { code: 'CC7A', type: 'general' },
    weekly: emptyWeekly(),
    events: [],
    holidays: [],
    trackers: [],
    ...overrides,
  };
}

describe('buildRoomPacket — special rooms', () => {
  it('always emits all 7 WD markers, bare when empty, bare slots when enabled', () => {
    const weekly = emptyWeekly();
    weekly[1] = [{ start: '0800', end: '1000', enabled: true }];
    const packet = buildRoomPacket(specialSchedule({ weekly }));
    expect(packet).toBe('CCLab|WD1|0800-1000|WD2|WD3|WD4|WD5|WD6|WD7');
  });

  it('omits E/H/T sections entirely when there is nothing to say', () => {
    const packet = buildRoomPacket(specialSchedule());
    expect(packet).toBe('CCLab|WD1|WD2|WD3|WD4|WD5|WD6|WD7');
  });

  it('encodes a bare E marker with date-grouped event windows, always carrying an explicit Y/N flag', () => {
    const packet = buildRoomPacket(
      specialSchedule({
        events: [
          {
            date: '20260809',
            windows: [
              { start: '0900', end: '1400', enabled: true },
              { start: '1500', end: '1630', enabled: false },
            ],
          },
        ],
      }),
    );
    expect(packet).toBe('CCLab|WD1|WD2|WD3|WD4|WD5|WD6|WD7|E|20260809|0900-1400Y|1500-1630N');
  });

  it('encodes a bare H marker with holiday ranges', () => {
    const packet = buildRoomPacket(
      specialSchedule({ holidays: [{ start: '20261001', end: '20261101' }] }),
    );
    expect(packet).toBe('CCLab|WD1|WD2|WD3|WD4|WD5|WD6|WD7|H|20261001-20261101');
  });

  it('encodes a bare T marker with tracker chat ids', () => {
    const packet = buildRoomPacket(
      specialSchedule({ trackers: [{ roomCode: 'CCLab', chatId: '111' }, { roomCode: 'CCLab', chatId: '222' }] }),
    );
    expect(packet).toBe('CCLab|WD1|WD2|WD3|WD4|WD5|WD6|WD7|T|111|222');
  });

  it('puts sections in the fixed order RoomCode, WD*, E, H, T', () => {
    const weekly = emptyWeekly();
    weekly[1] = [{ start: '1200', end: '1300', enabled: true }];
    const packet = buildRoomPacket(
      specialSchedule({
        weekly,
        events: [{ date: '20260809', windows: [{ start: '0900', end: '1000', enabled: true }] }],
        holidays: [{ start: '20261001', end: '20261101' }],
        trackers: [{ roomCode: 'CCLab', chatId: '111' }],
      }),
    );
    expect(packet).toBe(
      'CCLab|WD1|1200-1300|WD2|WD3|WD4|WD5|WD6|WD7|E|20260809|0900-1000Y|H|20261001-20261101|T|111',
    );
  });
});

describe('buildRoomPacket — general (regular) rooms', () => {
  it('omits every WD marker when there are no overrides at all', () => {
    const packet = buildRoomPacket(generalSchedule());
    expect(packet).toBe('CC7A');
  });

  it('only emits a WD marker for a day with an override, with an explicit N flag to vacate', () => {
    const weekly = emptyWeekly();
    weekly[1] = [{ start: '1000', end: '1050', enabled: false }];
    const packet = buildRoomPacket(generalSchedule({ weekly }));
    expect(packet).toBe('CC7A|WD1|1000-1050N');
  });

  it('does not emit WD markers for days with no override, even between two that have one', () => {
    const weekly = emptyWeekly();
    weekly[1] = [{ start: '1000', end: '1050', enabled: false }];
    weekly[5] = [{ start: '1400', end: '1450', enabled: false }];
    const packet = buildRoomPacket(generalSchedule({ weekly }));
    expect(packet).toBe('CC7A|WD1|1000-1050N|WD5|1400-1450N');
  });
});
