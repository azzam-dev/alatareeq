import { I18nManager, StyleSheet } from 'react-native';

export const C = {
  bg: '#F5F3EE',
  card: '#FFFFFF',
  ink: '#1C211F',
  sub: '#5F6763',
  line: '#E3DFD6',
  // رمادي يبان على الأبيض (نقطة الأولوية المنخفضة)
  mute: '#8C938F',
  soft: '#ECE9E2',
  brand: '#0F6B4F',
  brandSoft: '#E1F0E9',
  warn: '#9A6700',
  warnSoft: '#FBF1DC',
  bad: '#B42318',
  badSoft: '#FCE8E6',
  sign: '#0F6B4F',
  passed: '#B7791F',
};

/** صف من اليمين لليسار سواء كانت لغة الجوال عربي أو إنجليزي */
export const ROW: 'row' | 'row-reverse' = I18nManager.isRTL ? 'row' : 'row-reverse';

const rtl = { textAlign: 'right', writingDirection: 'rtl' } as const;

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { ...rtl, fontSize: 26, fontWeight: '700', color: C.ink },
  h2: { ...rtl, fontSize: 17, fontWeight: '700', color: C.ink },
  text: { ...rtl, fontSize: 15, color: C.ink, lineHeight: 22 },
  sub: { ...rtl, fontSize: 13, color: C.sub, lineHeight: 19 },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  row: { flexDirection: ROW, alignItems: 'center', gap: 10 },
  input: {
    ...rtl, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: C.ink, backgroundColor: '#FFFFFF',
  },
  note: { ...rtl, fontSize: 13, color: C.warn, backgroundColor: C.warnSoft, padding: 10, borderRadius: 10, overflow: 'hidden' },
});
