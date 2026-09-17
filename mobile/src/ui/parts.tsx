import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { C, ROW, S } from './theme';

type BtnKind = 'normal' | 'primary' | 'danger' | 'ghost';

export function Btn({ title, onPress, kind = 'normal', disabled, flex }: {
  title: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, styles[kind], flex && { flex: 1 }, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 }]}
    >
      <Text style={[styles.btnText, (kind === 'primary' || kind === 'danger') && { color: '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: C.brand, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([id, label]) => (
        <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: value === id }} onPress={() => onChange(id)}
          style={[styles.segItem, value === id && styles.segOn]}>
          <Text style={[styles.chipText, value === id && { color: C.ink, fontWeight: '700' }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** «؟» صغير يفتح شرح. الكلام اللي ما يحتاجه المستخدم كل مرة يكون خلفه */
export function HelpDot({ open, onPress, label }: { open: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={`شرح ${label}`} accessibilityState={{ expanded: open }}
      onPress={onPress} hitSlop={12} style={[styles.help, open && styles.helpOn]}
    >
      <Text style={[styles.helpText, open && { color: '#FFFFFF' }]}>؟</Text>
    </Pressable>
  );
}

/** عنوان وجنبه «؟»، والشرح يطلع تحته */
export function HelpTitle({ title, help, style }: { title: string; help: string; style?: StyleProp<TextStyle> }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[S.row, { gap: 8 }]}>
        <Text style={style ?? S.h2}>{title}</Text>
        <HelpDot open={open} onPress={() => setOpen(!open)} label={title} />
      </View>
      {open && <Text style={S.sub}>{help}</Text>}
    </View>
  );
}

/** رأس الشاشة: العنوان يمين، والإعدادات ⚙ يسار أو سهم رجوع قبل العنوان */
export function ScreenHeader({ title, sub, help, onSettings, onBack }: {
  title: string; sub?: ReactNode; help?: string; onSettings?: () => void; onBack?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View style={[S.row, { gap: 8, flexShrink: 1 }]}>
          {onBack && (
            <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={onBack} hitSlop={12} style={styles.iconBtn}>
              <Text style={styles.iconText}>→</Text>
            </Pressable>
          )}
          <Text style={S.h1}>{title}</Text>
          {help && <HelpDot open={open} onPress={() => setOpen(!open)} label={title} />}
        </View>
        {onSettings && (
          <Pressable accessibilityRole="button" accessibilityLabel="الإعدادات" onPress={onSettings} hitSlop={12} style={styles.iconBtn}>
            <Text style={styles.iconText}>⚙</Text>
          </Pressable>
        )}
      </View>
      {sub}
      {open && help && <Text style={S.sub}>{help}</Text>}
    </View>
  );
}

export function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between', marginTop: 6 }]}>
      <Text style={S.h2}>{title}</Text>
      {count !== undefined && <Text style={S.sub}>{count}</Text>}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View style={[S.row, { flex: 1, gap: 8 }]}>
          <Text style={[S.text, { flexShrink: 1 }]}>{label}</Text>
          {hint && <HelpDot open={open} onPress={() => setOpen(!open)} label={label} />}
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand, false: C.line }} />
      </View>
      {open && hint && <Text style={S.sub}>{hint}</Text>}
    </View>
  );
}

export function Stepper({ label, hint, show, onMinus, onPlus }: { label: string; hint?: string; show: string; onMinus: () => void; onPlus: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View style={[S.row, { flex: 1, gap: 8 }]}>
          <Text style={[S.text, { flexShrink: 1 }]}>{label}</Text>
          {hint && <HelpDot open={open} onPress={() => setOpen(!open)} label={label} />}
        </View>
        <View style={[S.row, { gap: 6 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`زِد ${label}`} onPress={onPlus} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable>
          <Text style={[S.text, { minWidth: 48, textAlign: 'center', fontWeight: '700' }]}>{show}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`نقّص ${label}`} onPress={onMinus} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
        </View>
      </View>
      {open && hint && <Text style={S.sub}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  normal: { backgroundColor: C.soft },
  primary: { backgroundColor: C.brand },
  danger: { backgroundColor: C.bad },
  ghost: { backgroundColor: 'transparent' },
  btnText: { fontSize: 16, fontWeight: '600', color: C.ink },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  chipText: { fontSize: 14, color: C.sub, writingDirection: 'rtl' },
  seg: { flexDirection: ROW, backgroundColor: C.soft, borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segOn: { backgroundColor: '#FFFFFF' },
  step: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, color: C.ink, lineHeight: 26 },
  help: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  helpOn: { backgroundColor: C.brand, borderColor: C.brand },
  helpText: { fontSize: 13, fontWeight: '700', color: C.sub, lineHeight: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, color: C.ink, lineHeight: 24 },
});
