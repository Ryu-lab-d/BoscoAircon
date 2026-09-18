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

const NAVY = '#1e3c72';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#1c1f26',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 17, fontWeight: '800', color: '#1c1f26' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeSpecial: { backgroundColor: '#fef3c7' },
  badgeGeneral: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  week: { fontSize: 12, marginTop: 8, color: '#4b5563' },
  meta: { fontSize: 12, marginTop: 3, color: '#8b93a1' },
  editToggle: { marginTop: 10 },
  editToggleText: { color: NAVY, fontSize: 12, fontWeight: '700' },
  editor: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef0f3',
    paddingTop: 10,
  },
  dayBlock: { marginBottom: 10 },
  dayLabel: { fontSize: 12, fontWeight: '700', color: '#1c1f26', marginBottom: 5 },
  dayEmpty: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  windowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 6 },
  timeInput: {
    borderWidth: 1.5,
    borderColor: '#e2e4e9',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 12,
    width: 52,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  dash: { fontSize: 12, color: '#8b93a1' },
  enabledToggle: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  enabledOn: { backgroundColor: '#dcfce7' },
  enabledOff: { backgroundColor: '#fee2e2' },
  enabledToggleText: { fontSize: 11, fontWeight: '700' },
  removeButton: { paddingHorizontal: 6, paddingVertical: 4 },
  removeButtonText: { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  addButton: { alignSelf: 'flex-start', marginTop: 2 },
  addButtonText: { color: NAVY, fontSize: 11, fontWeight: '700' },
  sendButton: {
    marginTop: 12,
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  statusOk: { color: '#16a34a', fontSize: 12, marginTop: 8, fontWeight: '600' },
  statusErr: { color: '#dc2626', fontSize: 12, marginTop: 8, fontWeight: '600' },
});
