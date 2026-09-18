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
        <Text style={styles.title}>BoscoAircon</Text>
        <Text style={styles.subtitle}>นำเข้าตารางเรียนจริงแล้วคอมไพล์เป็นตารางเปิด-ปิดแอร์รายห้อง</Text>

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
        data={schedules}
        keyExtractor={item => item.room.code}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const status = roomStatus[item.room.code];
          return (
            <RoomCard
              schedule={item}
              status={status}
              onSend={() => sendRoom(item)}
              onChangeWeekly={newWeekly => {
                const updated = { ...item, weekly: newWeekly };
                setSchedules(schedules.map(s => (s.room.code === item.room.code ? updated : s)));
              }}
            />
          );
        }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>เลือกไฟล์ตารางเรียนแล้วกดคอมไพล์เพื่อเริ่มต้น</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f5f7' },
  title: { fontSize: 22, fontWeight: '700', color: '#1c1f26' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e4e9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  importInfo: { flex: 1, marginRight: 8 },
  importLabel: { fontSize: 12, fontWeight: '700', color: '#1c1f26' },
  importFileName: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  importButton: {
    backgroundColor: '#eef2ff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  importButtonText: { color: '#2563eb', fontWeight: '700', fontSize: 12 },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  disabledButton: { opacity: 0.5 },
  sendAllButton: { backgroundColor: '#16a34a' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: '#dc2626', marginBottom: 12, fontSize: 13 },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warningTitle: { fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  warningText: { fontSize: 11, color: '#92400e' },
  settingsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  settingsField: { flex: 1 },
  label: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e4e9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  list: { flex: 1 },
  roomCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e4e9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomCode: { fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeSpecial: { backgroundColor: '#dbeafe' },
  badgeGeneral: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  roomWeek: { fontSize: 12, marginTop: 6 },
  roomEvents: { fontSize: 12, marginTop: 2, color: '#6b7280' },
  sendButton: {
    marginTop: 10,
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  statusOk: { color: '#16a34a', fontSize: 12, marginTop: 6 },
  statusErr: { color: '#dc2626', fontSize: 12, marginTop: 6 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 40 },
});
