import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EventWindow, RoomSchedule, WeekDay } from '../types/timetable';

const DAY_LABELS: Record<WeekDay, string> = {
  1: 'จันทร์',
  2: 'อังคาร',
  3: 'พุธ',
  4: 'พฤหัสบดี',
  5: 'ศุกร์',
  6: 'เสาร์',
  7: 'อาทิตย์',
};
const DAY_ORDER: WeekDay[] = [1, 2, 3, 4, 5, 6, 7];
const SHORT_DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

export function weekdaySummary(schedule: RoomSchedule): string {
  const active = DAY_ORDER.filter(d => schedule.weekly[d].length > 0).map(d => SHORT_DAY_LABELS[d - 1]);
  if (active.length === 0) {
    return schedule.room.type === 'special' ? 'ไม่มีช่วงเปิดแอร์สัปดาห์นี้' : 'ใช้เวลาเปิดแอร์มาตรฐานทุกวัน';
  }
  return active.join(' ');
}

export type RoomStatus = { text: string; ok: boolean } | null;

interface RoomCardProps {
  schedule: RoomSchedule;
  status: RoomStatus;
  onSend: () => void;
  onChangeWeekly: (weekly: Record<WeekDay, EventWindow[]>) => void;
}

export default function RoomCard({ schedule, status, onSend, onChangeWeekly }: RoomCardProps) {
  const [expanded, setExpanded] = useState(false);

  function updateWindow(day: WeekDay, index: number, patch: Partial<EventWindow>) {
    onChangeWeekly({
      ...schedule.weekly,
      [day]: schedule.weekly[day].map((w, i) => (i === index ? { ...w, ...patch } : w)),
    });
  }

  function addWindow(day: WeekDay) {
    const defaultEnabled = schedule.room.type === 'special';
    onChangeWeekly({
      ...schedule.weekly,
      [day]: [...schedule.weekly[day], { start: '0800', end: '0900', enabled: defaultEnabled }],
    });
  }

  function removeWindow(day: WeekDay, index: number) {
    onChangeWeekly({ ...schedule.weekly, [day]: schedule.weekly[day].filter((_, i) => i !== index) });
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded(e => !e)}>
        <Text style={styles.code}>{schedule.room.code}</Text>
        <View style={[styles.badge, schedule.room.type === 'special' ? styles.badgeSpecial : styles.badgeGeneral]}>
          <Text style={styles.badgeText}>{schedule.room.type === 'special' ? 'ตารางเฉพาะ' : 'ตารางมาตรฐาน'}</Text>
        </View>
      </Pressable>
      <Text style={styles.week}>เปิดแอร์: {weekdaySummary(schedule)}</Text>
      {schedule.events.length > 0 && (
        <Text style={styles.meta}>กิจกรรม: {schedule.events.map(e => e.date).join(', ')}</Text>
      )}
      {schedule.holidays.length > 0 && <Text style={styles.meta}>วันหยุด: {schedule.holidays.length} ช่วง</Text>}

      <Pressable style={styles.editToggle} onPress={() => setExpanded(e => !e)}>
        <Text style={styles.editToggleText}>{expanded ? 'ซ่อนการแก้ไข' : 'แก้ไขตารางห้องนี้'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.editor}>
          {DAY_ORDER.map(day => (
            <View key={day} style={styles.dayBlock}>
              <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
              {schedule.weekly[day].length === 0 && (
                <Text style={styles.dayEmpty}>
                  {schedule.room.type === 'special' ? 'ปิดทั้งวัน' : 'ใช้เวลามาตรฐาน (ไม่มีข้อยกเว้น)'}
                </Text>
              )}
              {schedule.weekly[day].map((w, i) => (
                <View key={i} style={styles.windowRow}>
                  <TextInput
                    style={styles.timeInput}
                    value={w.start}
                    onChangeText={t => updateWindow(day, i, { start: t })}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  <Text style={styles.dash}>-</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={w.end}
                    onChangeText={t => updateWindow(day, i, { end: t })}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  <Pressable
                    style={[styles.enabledToggle, w.enabled ? styles.enabledOn : styles.enabledOff]}
                    onPress={() => updateWindow(day, i, { enabled: !w.enabled })}
                  >
                    <Text style={styles.enabledToggleText}>{w.enabled ? 'เปิด' : 'ปิด'}</Text>
                  </Pressable>
                  <Pressable style={styles.removeButton} onPress={() => removeWindow(day, i)}>
                    <Text style={styles.removeButtonText}>ลบ</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addButton} onPress={() => addWindow(day)}>
                <Text style={styles.addButtonText}>+ เพิ่มช่วงเวลา</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.sendButton} onPress={onSend}>
        <Text style={styles.sendButtonText}>ส่งสัญญาณห้องนี้</Text>
      </Pressable>
      {status && <Text style={status.ok ? styles.statusOk : styles.statusErr}>{status.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e4e9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeSpecial: { backgroundColor: '#dbeafe' },
  badgeGeneral: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  week: { fontSize: 12, marginTop: 6 },
  meta: { fontSize: 12, marginTop: 2, color: '#6b7280' },
  editToggle: { marginTop: 8 },
  editToggleText: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  editor: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef0f3',
    paddingTop: 8,
  },
  dayBlock: { marginBottom: 8 },
  dayLabel: { fontSize: 12, fontWeight: '700', color: '#1c1f26', marginBottom: 4 },
  dayEmpty: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  windowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  timeInput: {
    borderWidth: 1,
    borderColor: '#e2e4e9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    width: 52,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  dash: { fontSize: 12, color: '#6b7280' },
  enabledToggle: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  enabledOn: { backgroundColor: '#dcfce7' },
  enabledOff: { backgroundColor: '#fee2e2' },
  enabledToggleText: { fontSize: 11, fontWeight: '700' },
  removeButton: { paddingHorizontal: 6, paddingVertical: 4 },
  removeButtonText: { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  addButton: { alignSelf: 'flex-start', marginTop: 2 },
  addButtonText: { color: '#2563eb', fontSize: 11, fontWeight: '700' },
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
});
