import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { categoryPicker } from '../../../src/core/categorySearch';
import { CATEGORY_BY_ID, type CategoryDef } from '../../../src/core/lexicon';
import type { CategoryId } from '../../../src/core/types';
import { Btn } from './parts';
import { C, ROW, S } from './theme';

/**
 * «وين؟» بالفئة: حقل تضغطه تنفتح منه نافذة بكل الفئات مع بحث، والمناسبة لأغراض التذكير أول.
 * تختار أكثر من فئة والنافذة مفتوحة، والمختارة تطلع أزرار ✕ تحت الحقل.
 */
export function CategoryPicker({ title, value, onChange, onSearchName }: {
  /** عنوان التذكير، ومنه الفئات المناسبة */
  title: string;
  value: CategoryId[];
  onChange: (ids: CategoryId[]) => void;
  /** «دوّر عليه بالاسم» لما البحث ما يلقى فئة */
  onSearchName: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: CategoryId) => onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button" accessibilityLabel="اختر فئة" onPress={() => setOpen(true)}
        style={({ pressed }) => [S.input, styles.field, pressed && { opacity: 0.7 }]}
      >
        <Text style={[S.text, { color: C.sub, flex: 1 }]}>{value.length ? 'أضف فئة ثانية…' : 'اختر فئة…'}</Text>
        <Text style={{ color: C.sub, fontSize: 16 }}>⌄</Text>
      </Pressable>
      {value.length > 0 && (
        <View style={styles.chips}>
          {value.map((id) => (
            <Pressable
              key={id} accessibilityRole="button" accessibilityLabel={`شيل ${CATEGORY_BY_ID[id].label}`} onPress={() => toggle(id)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
            >
              <Text style={[S.text, { color: C.brand, fontWeight: '700' }]}>{CATEGORY_BY_ID[id].label}</Text>
              <Text style={{ color: C.brand, fontSize: 16, fontWeight: '700' }}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}
      {open && (
        <PickerSheet
          title={title} value={value} onToggle={toggle} onClose={() => setOpen(false)}
          onSearchName={(q) => { setOpen(false); onSearchName(q); }}
        />
      )}
    </View>
  );
}

function PickerSheet({ title, value, onToggle, onClose, onSearchName }: {
  title: string;
  value: CategoryId[];
  onToggle: (id: CategoryId) => void;
  onClose: () => void;
  onSearchName: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => categoryPicker(title, query), [title, query]);
  // نفس شرط `categoryPicker`: حرفين أو أكثر
  const searching = query.replace(/\s+/g, '').length >= 2;
  const row = (c: CategoryDef) => <Row key={c.id} c={c} on={value.includes(c.id)} onPress={() => onToggle(c.id)} />;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.h2}>وين تبي أذكرك؟</Text>
            <Btn title="تم" kind="primary" onPress={onClose} />
          </View>
          <TextInput
            style={S.input} value={query} onChangeText={setQuery}
            placeholder="دوّر: ألعاب، جوالات، بنادول…" placeholderTextColor={C.sub}
          />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
            {searching ? (
              list.rest.length ? list.rest.map(row) : (
                <View style={{ gap: 8, paddingTop: 6 }}>
                  <Text style={S.sub}>ما لقيت «{query.trim()}» كفئة.</Text>
                  <Btn title="دوّر عليه بالاسم" onPress={() => onSearchName(query.trim())} />
                </View>
              )
            ) : (
              <>
                {list.suggested.length > 0 && (
                  <>
                    <Text style={[S.sub, styles.head]}>تناسب «{title.trim()}»</Text>
                    {list.suggested.map(row)}
                  </>
                )}
                <Text style={[S.sub, styles.head]}>كل الفئات</Text>
                {list.rest.map(row)}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ c, on, onPress }: { c: CategoryDef; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c.label} onPress={onPress}
      style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && { opacity: 0.7 }]}
    >
      <Text style={[S.text, { flex: 1 }, on && { color: C.brand, fontWeight: '700' }]}>{c.label}</Text>
      <View style={[styles.box, on && styles.boxOn]}>
        {on && <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>✓</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: ROW, alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: C.brandSoft,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    maxHeight: '85%', backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line },
  head: { fontWeight: '700', marginTop: 6 },
  row: {
    flexDirection: ROW, alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
  },
  rowOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
});
