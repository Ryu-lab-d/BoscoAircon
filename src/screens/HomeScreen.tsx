import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { WorkBook } from 'xlsx';
import { compileSchedules } from '../excel/compiler';
import { parseHolidays } from '../excel/holidays';
import { parseSpecialEvents } from '../excel/specialEvents';
import { parseRoomMappingRules, TimetableWarning } from '../excel/timetableCompiler';
import { parseTrackers } from '../excel/trackers';
import { readWorkbookFromBase64 } from '../excel/xlsxUtil';
import { pickWorkbook } from '../excel/pickWorkbook';
import { filterSchedulesForDate } from '../udp/eventFilter';
import { broadcastSchedules, TimetableBroadcaster } from '../udp/udpSender';
import type { Holiday, RoomMappingRule, RoomSchedule, SpecialEventRow, Tracker, WeekDay, EventWindow } from '../types/timetable';
import RoomCard, { RoomStatus, weekdaySummary } from './RoomCard';

const DEFAULT_PORT = '9000';
const DEFAULT_ADDRESS = '255.255.255.255';
// Gives the ESP8266/microbit receivers breathing room between packets when
// broadcasting to many rooms at once — see BroadcastOptions.interPacketDelayMs.
const SEND_ALL_DELAY_MS = 150;


interface ImportRowProps {
  label: string;
  required?: boolean;
  fileName: string | null;
  count?: number;
  onPress: () => void;
  loading: boolean;
}

function ImportRow({ label, required, fileName, count, onPress, loading }: ImportRowProps) {
  return (
    <View style={styles.importRow}>
      <View style={styles.importInfo}>
        <Text style={styles.importLabel}>
          {label}
          {required ? ' *' : ''}
        </Text>
        <Text style={styles.importFileName} numberOfLines={1}>
          {fileName ? `${fileName}${count !== undefined ? ` (${count})` : ''}` : 'ยังไม่ได้เลือก'}
        </Text>
      </View>
      <Pressable style={styles.importButton} onPress={onPress} disabled={loading}>
        <Text style={styles.importButtonText}>เลือกไฟล์</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const [timetableWb, setTimetableWb] = useState<WorkBook | null>(null);
  const [timetableName, setTimetableName] = useState<string | null>(null);

  const [roomMappingRules, setRoomMappingRules] = useState<RoomMappingRule[]>([]);
  const [roomMappingName, setRoomMappingName] = useState<string | null>(null);

  const [specialEvents, setSpecialEvents] = useState<SpecialEventRow[]>([]);
  const [specialEventsName, setSpecialEventsName] = useState<string | null>(null);

  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [trackersName, setTrackersName] = useState<string | null>(null);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysName, setHolidaysName] = useState<string | null>(null);

  const [schedules, setSchedules] = useState<RoomSchedule[]>([]);
  const [warnings, setWarnings] = useState<TimetableWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [roomStatus, setRoomStatus] = useState<Record<string, RoomStatus>>({});
  const [sendingAll, setSendingAll] = useState(false);

  const pickAndParse = useCallback(async <T,>(onParsed: (workbook: WorkBook, name: string) => T): Promise<T | null> => {
    setError(null);
    setLoading(true);
    try {
      const picked = await pickWorkbook();
      if (!picked) {
        return null; // user cancelled
      }
      const workbook = readWorkbookFromBase64(picked.base64);
      return onParsed(workbook, picked.name);
    } catch (err) {
      setError(`อ่านไฟล์ไม่สำเร็จ: ${(err as Error).message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickTimetable = useCallback(() => {
    pickAndParse((wb, name) => {
      setTimetableWb(wb);
      setTimetableName(name);
      setSchedules([]);
      setWarnings([]);
    });
  }, [pickAndParse]);

  const handlePickRoomMappingRules = useCallback(() => {
    pickAndParse((wb, name) => {
      setRoomMappingRules(parseRoomMappingRules(wb));
      setRoomMappingName(name);
    });
  }, [pickAndParse]);

  const handlePickSpecialEvents = useCallback(() => {
    pickAndParse((wb, name) => {
      setSpecialEvents(parseSpecialEvents(wb));
      setSpecialEventsName(name);
    });
  }, [pickAndParse]);

  const handlePickTrackers = useCallback(() => {
    pickAndParse((wb, name) => {
      setTrackers(parseTrackers(wb));
      setTrackersName(name);
    });
  }, [pickAndParse]);

  const handlePickHolidays = useCallback(() => {
    pickAndParse((wb, name) => {
      setHolidays(parseHolidays(wb));
      setHolidaysName(name);
    });
  }, [pickAndParse]);

  const handleCompile = useCallback(() => {
    if (!timetableWb) {
      return;
    }
    setError(null);
    setCompiling(true);
    try {
      const result = compileSchedules({
        timetable: timetableWb,
        roomMappingRules,
        specialEvents,
        trackers,
        holidays,
      });
      setSchedules(result.schedules);
      setWarnings(result.warnings);
      setRoomStatus({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCompiling(false);
    }
  }, [timetableWb, roomMappingRules, specialEvents, trackers, holidays]);

  const parsedPort = useCallback(() => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error('พอร์ต UDP ต้องเป็นตัวเลข 1-65535');
    }
    return value;
  }, [port]);

  const sendRoom = useCallback(
    (schedule: RoomSchedule) => {
      const addr = address.trim() || DEFAULT_ADDRESS;
      const doSend = async () => {
        setRoomStatus(prev => ({ ...prev, [schedule.room.code]: { text: 'กำลังส่ง…', ok: true } }));
        const broadcaster = new TimetableBroadcaster({ port: parsedPort(), address: addr });
        try {
          const [todaySchedule] = filterSchedulesForDate([schedule]);
          await broadcaster.sendSchedule(todaySchedule);
          setRoomStatus(prev => ({
            ...prev,
            [schedule.room.code]: { text: `ส่งสำเร็จ (${addr}:${port})`, ok: true },
          }));
        } catch (err) {
          setRoomStatus(prev => ({
            ...prev,
            [schedule.room.code]: { text: `ผิดพลาด: ${(err as Error).message}`, ok: false },
          }));
        } finally {
          broadcaster.close();
        }
      };

      try {
        parsedPort();
      } catch (err) {
        Alert.alert('พอร์ตไม่ถูกต้อง', (err as Error).message);
        return;
      }

      if (addr === '127.0.0.1') {
        doSend();
        return;
      }
      Alert.alert(
        'ยืนยันการส่งสัญญาณจริง',
        `จะส่งไปที่ห้อง ${schedule.room.code} ผ่าน ${addr}:${port}`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          { text: 'ส่ง', style: 'default', onPress: doSend },
        ],
      );
    },
    [address, port, parsedPort],
  );

  const sendAll = useCallback(() => {
    const addr = address.trim() || DEFAULT_ADDRESS;
    let validPort: number;
    try {
      validPort = parsedPort();
    } catch (err) {
      Alert.alert('พอร์ตไม่ถูกต้อง', (err as Error).message);
      return;
    }

    const doSendAll = async () => {
      setSendingAll(true);
      try {
        const todaySchedules = filterSchedulesForDate(schedules);
        const results = await broadcastSchedules(todaySchedules, {
          port: validPort,
          address: addr,
          interPacketDelayMs: SEND_ALL_DELAY_MS,
        });
        const nextStatus: Record<string, RoomStatus> = {};
        for (const result of results) {
          nextStatus[result.room] = result.ok
            ? { text: `ส่งสำเร็จ (${addr}:${port})`, ok: true }
            : { text: `ผิดพลาด: ${result.error}`, ok: false };
        }
        setRoomStatus(prev => ({ ...prev, ...nextStatus }));
        const failed = results.filter(r => !r.ok);
        if (failed.length > 0) {
          Alert.alert('ส่งไม่ครบ', `สำเร็จ ${results.length - failed.length}/${results.length} ห้อง`);
        }
      } finally {
        setSendingAll(false);
      }
    };

    Alert.alert(
      'ยืนยันการส่งสัญญาณจริงทุกห้อง',
      `จะส่งทั้งหมด ${schedules.length} ห้อง ผ่าน ${addr}:${port}`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ส่งทั้งหมด', style: 'default', onPress: doSendAll },
      ],
    );
  }, [address, port, parsedPort, schedules]);

  const canCompile = timetableWb !== null && !loading && !compiling;

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>SARASAS EKTRA SCHOOL</Text>
          <Text style={styles.title}>BoscoAircon</Text>
          <Text style={styles.subtitle}>นำเข้าตารางเรียนจริงแล้วคอมไพล์เป็นตารางเปิด-ปิดแอร์รายห้อง</Text>
        </View>

        <Text style={styles.sectionLabel}>นำเข้าไฟล์</Text>
        <ImportRow
          label="ตารางเรียน (Timetable)"
          required
          fileName={timetableName}
          onPress={handlePickTimetable}
          loading={loading}
        />
        <ImportRow
          label="กติกาห้องพิเศษ (RoomMappingRules)"
          fileName={roomMappingName}
          count={roomMappingName ? roomMappingRules.length : undefined}
          onPress={handlePickRoomMappingRules}
          loading={loading}
        />
        <ImportRow
          label="กิจกรรมพิเศษ (SpecialEvents)"
          fileName={specialEventsName}
          count={specialEventsName ? specialEvents.length : undefined}
          onPress={handlePickSpecialEvents}
          loading={loading}
        />
        <ImportRow
          label="ผู้รับแจ้งเตือน (Trackers)"
          fileName={trackersName}
          count={trackersName ? trackers.length : undefined}
          onPress={handlePickTrackers}
          loading={loading}
        />
        <ImportRow
          label="วันหยุด (Holidays)"
          fileName={holidaysName}
          count={holidaysName ? holidays.length : undefined}
          onPress={handlePickHolidays}
          loading={loading}
        />

        <Pressable
          style={[styles.primaryButton, !canCompile && styles.disabledButton]}
          onPress={handleCompile}
          disabled={!canCompile}
        >
          {compiling ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>คอมไพล์ตาราง</Text>
          )}
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        {warnings.length > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>ข้ามบางแถวในตารางเรียน ({warnings.length})</Text>
            {warnings.slice(0, 5).map((w, i) => (
              <Text key={i} style={styles.warningText}>
                แถว {w.row}: {w.message}
              </Text>
            ))}
            {warnings.length > 5 && <Text style={styles.warningText}>...และอีก {warnings.length - 5} รายการ</Text>}
          </View>
        )}

        <Text style={styles.sectionLabel}>ตั้งค่าเครือข่าย</Text>
        <View style={styles.settingsRow}>
          <View style={styles.settingsField}>
            <Text style={styles.label}>พอร์ต UDP</Text>
            <TextInput style={styles.input} value={port} onChangeText={setPort} keyboardType="number-pad" />
          </View>
          <View style={styles.settingsField}>
            <Text style={styles.label}>ที่อยู่ Broadcast</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} autoCapitalize="none" />
          </View>
        </View>

        {schedules.length > 0 && (
          <Pressable style={[styles.primaryButton, styles.sendAllButton]} onPress={sendAll} disabled={sendingAll}>
            {sendingAll ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>ส่งสัญญาณทุกห้อง ({schedules.length})</Text>
            )}
          </Pressable>
        )}

        {schedules.length > 0 && <Text style={styles.sectionLabel}>รายการห้อง ({schedules.length})</Text>}
      </View>
    ),
    [
      timetableName,
      roomMappingName,
      roomMappingRules.length,
      specialEventsName,
      specialEvents.length,
      trackersName,
      trackers.length,
      holidaysName,
      holidays.length,
      loading,
      compiling,
      canCompile,
      error,
      warnings,
      port,
      address,
      schedules.length,
      sendingAll,
      handlePickTimetable,
      handlePickRoomMappingRules,
      handlePickSpecialEvents,
      handlePickTrackers,
      handlePickHolidays,
      handleCompile,
      sendAll,
    ],
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={schedules}
        keyExtractor={item => item.room.code}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const status = roomStatus[item.room.code];
          return (
            <View style={styles.roomCardWrapper}>
              <RoomCard
                schedule={item}
                status={status}
                onSend={() => sendRoom(item)}
                onChangeWeekly={newWeekly => {
                  const updated = { ...item, weekly: newWeekly };
                  setSchedules(schedules.map(s => (s.room.code === item.room.code ? updated : s)));
                }}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>เลือกไฟล์ตารางเรียนแล้วกดคอมไพล์เพื่อเริ่มต้น</Text> : undefined
        }
      />
    </View>
  );
}

const NAVY = '#1e3c72';
const GOLD = '#ffd700';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f5f9' },
  hero: {
    backgroundColor: NAVY,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    marginBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    marginHorizontal: 16,
    shadowColor: '#1c1f26',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  importInfo: { flex: 1, marginRight: 8 },
  importLabel: { fontSize: 13, fontWeight: '700', color: '#1c1f26' },
  importFileName: { fontSize: 11, color: '#8b93a1', marginTop: 2 },
  importButton: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importButtonText: { color: NAVY, fontWeight: '700', fontSize: 12 },
  primaryButton: {
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  disabledButton: { opacity: 0.4, shadowOpacity: 0 },
  sendAllButton: { backgroundColor: '#166534', shadowColor: '#166534' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
  error: { color: '#dc2626', marginBottom: 12, marginHorizontal: 16, fontSize: 13 },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  warningTitle: { fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  warningText: { fontSize: 11, color: '#92400e' },
  settingsRow: { flexDirection: 'row', gap: 12, marginBottom: 8, marginHorizontal: 16 },
  settingsField: { flex: 1 },
  label: { fontSize: 11, color: '#8b93a1', marginBottom: 4, fontWeight: '600' },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e4e9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#1c1f26',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  roomCardWrapper: { marginHorizontal: 16, marginBottom: 10 },
  empty: { textAlign: 'center', color: '#8b93a1', marginTop: 40, marginHorizontal: 16, fontSize: 13 },
});
