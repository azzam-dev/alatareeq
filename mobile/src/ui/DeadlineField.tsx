import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  effectiveRemind, isAllDay, newDeadline, remindOptions, remindTime, shiftDay, shiftTime,
} from '../../../src/core/deadline';
import type { RemindBefore } from '../../../src/core/types';
import { formatClock, formatWhen, REMIND_LABEL } from './format';
import { Chip, Chips, Stepper, ToggleRow } from './parts';
import { C, S } from './theme';

/**
 * «آخر موعد» في المحرر، ٣ أسطر ونص: مفتاح، عدّاد «اليوم»، عدّاد «الوقت» (طول اليوم أو نص ساعة نص ساعة)،
 * وسطر «بنذكرك … · تغيير» تنفتح منه خيارات «ذكرني». بأزرار + و − بدون مكتبة تاريخ.
 */
export function DeadlineField({ deadline, remind, onChange, onRemindChange }: {
  deadline?: number;
  remind?: RemindBefore;
  onChange: (deadline: number | undefined) => void;
  onRemindChange: (remind: RemindBefore) => void;
}) {
  // تسكير المفتاح ثم فتحه يرجّع نفس الموعد
  const last = useRef(deadline);
  if (deadline !== undefined) last.current = deadline;
  const [choosing, setChoosing] = useState(false);
  const now = Date.now();

  const toggle = (on: boolean) => onChange(on ? last.current ?? newDeadline(now) : undefined);

  if (deadline === undefined) return <ToggleRow label="آخر موعد" value={false} onChange={toggle} />;

  const allDay = isAllDay(deadline);
  const chosen = effectiveRemind(deadline, remind);
  const at = remindTime(deadline, remind);
  const passed = deadline < now;
  const status = passed ? 'هالوقت فات'
    : at === null ? 'ما بنذكرك'
      : at > now ? `بنذكرك ${formatWhen(at)}`
        : 'وقت التذكير فات';

  return (
    <View style={{ gap: 10 }}>
      <ToggleRow label="آخر موعد" value onChange={toggle} />
      <Stepper
        label="اليوم" show={formatWhen(deadline, false)}
        onMinus={() => onChange(shiftDay(deadline, -1, now))} onPlus={() => onChange(shiftDay(deadline, 1, now))}
      />
      <Stepper
        label="الوقت" show={allDay ? 'طول اليوم' : formatClock(deadline)}
        onMinus={() => onChange(shiftTime(deadline, -1, now))} onPlus={() => onChange(shiftTime(deadline, 1, now))}
      />
      <View style={[S.row, { gap: 6 }]}>
        <Text style={[S.sub, passed && { color: C.bad, fontWeight: '600' }]}>{status} ·</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: choosing }} hitSlop={8} onPress={() => setChoosing(!choosing)}>
          <Text style={[S.sub, { color: C.brand, fontWeight: '700' }]}>تغيير</Text>
        </Pressable>
      </View>
      {choosing && (
        <Chips>
          {remindOptions(allDay).map((r) => (
            <Chip key={r} label={REMIND_LABEL[r]} on={chosen === r} onPress={() => { onRemindChange(r); setChoosing(false); }} />
          ))}
        </Chips>
      )}
    </View>
  );
}
