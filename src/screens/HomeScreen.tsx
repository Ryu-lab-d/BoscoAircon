import React, { useCallback, useState } from 'react';
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
import { buildRoomSchedules, parseTimetableWorkbookFromBase64, TimetableParseError } from '../excel/excelParser';
import { pickWorkbook } from '../excel/pickWorkbook';
import { filterSchedulesForDate } from '../udp/eventFilter';
import { broadcastSchedules, TimetableBroadcaster } from '../udp/udpSender';
import type { RoomSchedule } from '../types/timetable';

const DEFAULT_PORT = '9000';
const DEFAULT_ADDRESS = '255.255.255.255';
// Gives the ESP8266/microbit receivers breathing room between packets when
// broadcasting to many rooms at once — see BroadcastOptions.interPacketDelayMs.
const SEND_ALL_DELAY_MS = 150;

type RoomStatus = { text: string; ok: boolean } | null;

function weekdaySummary(schedule: RoomSchedule): string {
  const days = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const active = ([1, 2, 3, 4, 5, 6, 7] as const)
    .filter(d => schedule.weekly[d].length > 0)
    .map(d => days[d - 1]);
  return active.length > 0 ? active.join(' ') : 'ไม่มีช่วงเปิดแอร์สัปดาห์นี้';
}

export default function HomeScreen() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<RoomSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [roomStatus, setRoomStatus] = useState<Record<string, RoomStatus>>({});
  const [sendingAll, setSendingAll] = useState(false);

  const handlePickFile = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const picked = await pickWorkbook();
      if (!picked) {
        return; // user cancelled
      }
      const parsed = parseTimetableWorkbookFromBase64(picked.base64);
      const resolved = buildRoomSchedules(parsed);
      setFileName(picked.name);
      setSchedules(resolved);
      setRoomStatus({});
    } catch (err) {
      const message =
        err instanceof TimetableParseError
          ? err.message
          : `อ่านไฟล์ไม่สำเร็จ: ${(err as Error).message}`;
      setError(message);
      setSchedules([]);
      setFileName(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
          // Only today's events go out — the microbit ignores the packet's
          // date token, so anything else would look "active" forever.
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BoscoAircon</Text>
      <Text style={styles.subtitle}>
        {fileName ? `ไฟล์: ${fileName} (${schedules.length} ห้อง)` : 'ยังไม่ได้เลือกไฟล์ Excel'}
      </Text>

      <Pressable style={styles.primaryButton} onPress={handlePickFile} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>เลือกไฟล์ Excel</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.settingsRow}>
        <View style={styles.settingsField}>
          <Text style={styles.label}>พอร์ต UDP</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.settingsField}>
          <Text style={styles.label}>ที่อยู่ Broadcast</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} autoCapitalize="none" />
        </View>
      </View>

      {schedules.length > 0 && (
        <Pressable
          style={[styles.primaryButton, styles.sendAllButton]}
          onPress={sendAll}
          disabled={sendingAll}
        >
          {sendingAll ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>ส่งสัญญาณทุกห้อง ({schedules.length})</Text>
          )}
        </Pressable>
      )}

      <FlatList
        style={styles.list}
        data={schedules}
        keyExtractor={item => item.room.code}
        renderItem={({ item }) => {
          const status = roomStatus[item.room.code];
          return (
            <View style={styles.roomCard}>
              <View style={styles.roomHeader}>
                <Text style={styles.roomCode}>{item.room.code}</Text>
                <View style={[styles.badge, item.room.type === 'special' ? styles.badgeSpecial : styles.badgeGeneral]}>
                  <Text style={styles.badgeText}>
                    {item.room.type === 'special' ? 'ตารางเฉพาะ' : 'ตารางมาตรฐาน'}
                  </Text>
                </View>
              </View>
              <Text style={styles.roomMeta}>
                {[item.room.category, item.room.location].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.roomWeek}>เปิดแอร์: {weekdaySummary(item)}</Text>
              {item.events.length > 0 && (
                <Text style={styles.roomEvents}>กิจกรรม: {item.events.map(e => e.eventId).join(', ')}</Text>
              )}
              <Pressable style={styles.sendButton} onPress={() => sendRoom(item)}>
                <Text style={styles.sendButtonText}>ส่งสัญญาณห้องนี้</Text>
              </Pressable>
              {status && (
                <Text style={status.ok ? styles.statusOk : styles.statusErr}>{status.text}</Text>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>เลือกไฟล์ Excel เพื่อเริ่มต้น</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f5f7' },
  title: { fontSize: 22, fontWeight: '700', color: '#1c1f26' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  sendAllButton: { backgroundColor: '#16a34a' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: '#dc2626', marginBottom: 12, fontSize: 13 },
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
  roomMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
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
