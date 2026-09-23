import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { targetLabel } from '../../../src/core/compose';
import { parseReminder } from '../../../src/core/parser';
import { toReminderInputs } from '../../../src/core/reminderInput';
import type { Reminder } from '../../../src/core/types';
import { store, uid } from '../state/store';
import { Btn, HelpTitle } from './parts';
import type { Draft } from './ReminderEditor';
import { EXAMPLES } from './samples';
import { C, S } from './theme';

export const NEEDS_PLACE = 'عالطريق للأغراض والمشاوير اللي لها محل. اختر وين تبي أذكرك.';

/**
 * نافذة الإضافة من زر + تحت. لو فهمنا الغرض ومكانه نحفظ مباشرة،
 * وإلا نفتح المحرر يختار فيه المستخدم وين («أتصل على أبوي» ما ينحفظ بدون محل).
 */
export function AddSheet({ onClose, onAdded, onNeedPlace }: {
  onClose: () => void;
  /** `learned`: فيها غرض محله من تفضيل المستخدم */
  onAdded: (rs: Reminder[], learned: boolean) => void;
  onNeedPlace: (d: Draft) => void;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const raw = text.trim();
    if (!raw) return;
    // كل غرض تذكير مستقل: اللي له محل ينحفظ، وأول واحد بدون محل يفتح المحرر
    const inputs = toReminderInputs(parseReminder(raw), raw, store.get().learned);
    const now = Date.now();
    const saved: Reminder[] = inputs.filter((i) => !i.needsPlace).map((i) => ({
      id: uid(), status: 'active', createdAt: now, raw, trigger: 'pass',
      title: i.title || targetLabel(i.target), target: i.target, deadline: i.deadline, priority: i.priority,
    }));
    saved.forEach(store.addReminder);
    if (saved.length) onAdded(saved, inputs.some((i) => i.learned));
    const missing = inputs.find((i) => i.needsPlace);
    if (missing) {
      onNeedPlace({
        title: missing.title, target: null, deadline: missing.deadline, priority: missing.priority, raw, notice: NEEDS_PLACE,
      });
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <HelpTitle title="وش تبي تتذكر؟" help="اكتبها زي ما تقولها، أو اضغط المايك في لوحة المفاتيح وقلها بصوتك." />
          <TextInput
            autoFocus style={S.input} value={text} onChangeText={setText} onSubmitEditing={submit}
            returnKeyType="send" placeholder={EXAMPLES[0]} placeholderTextColor={C.sub}
          />
          <Btn title="أضف" kind="primary" onPress={submit} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 4 },
});
