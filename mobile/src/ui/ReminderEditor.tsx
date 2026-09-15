import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { targetLabel } from '../../../src/core/compose';
import { searchCategories } from '../../../src/core/categorySearch';
import { cleanTitle, joinItems, splitItems } from '../../../src/core/items';
import { BRANDS, CATEGORIES } from '../../../src/core/lexicon';
import { normalize, stems } from '../../../src/core/normalize';
import type { ParsedReminder } from '../../../src/core/parser';
import type { CategoryId, Reminder, SpecificPlace, Target, TriggerKind } from '../../../src/core/types';
import { openPlaceInGoogleMaps } from '../services/device';
import { store, uid } from '../state/store';
import { formatWhen, placeBranch, TRIGGER_LABEL } from './format';
import { Btn, Chip, Chips, Seg } from './parts';
import { C, ROW, S } from './theme';

export interface Draft {
  id?: string;
  title: string;
  trigger: TriggerKind;
  target: Target | null;
  at?: number;
  notBefore?: number;
  deadline?: number;
  raw?: string;
  parsed?: ParsedReminder;
  donePlace?: SpecificPlace;
  doneAt?: number;
}

export function draftFromReminder(r: Reminder): Draft {
  return {
    id: r.id, title: r.title, trigger: r.trigger, target: r.target, at: r.at, notBefore: r.notBefore, deadline: r.deadline, raw: r.raw,
    donePlace: r.status === 'done' ? r.donePlace : undefined, doneAt: r.doneAt,
  };
}

type TargetMode = 'category' | 'brand';

function brandFromText(text: string): Target | null {
  const t = text.trim();
  if (!t) return null;
  const n = normalize(t).split(/\s+/).flatMap(stems);
  const known = BRANDS.find((b) => b.words.some((w) => normalize(w).split(' ').every((part) => n.includes(part))));
  if (known) return { kind: 'brand', brandId: known.id, label: known.label };
  return { kind: 'brand', brandId: `name:${t}`, label: t };
}

/** أوقات جاهزة بدل منتقي التاريخ في المستوى ١ */
function timePresets(): [string, number][] {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60_000);
  inHour.setMinutes(0, 0, 0);
  const tonight = new Date(now);
  tonight.setHours(21, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const out: [string, number][] = [['بعد ساعة تقريبًا', inHour.getTime()]];
  if (tonight.getTime() > now.getTime() + 10 * 60_000) out.push(['الليلة ٩', tonight.getTime()]);
  out.push(['بكرة ٩ الصبح', tomorrow.getTime()]);
  return out;
}

export function ReminderEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [trigger, setTrigger] = useState<TriggerKind>(draft.trigger);
  const [target, setTarget] = useState<Target | null>(draft.target);
  const [mode, setMode] = useState<TargetMode>(draft.target?.kind === 'brand' ? 'brand' : 'category');
  const [brandText, setBrandText] = useState(draft.target?.kind === 'brand' ? draft.target.label : '');
  const [at, setAt] = useState<number | undefined>(draft.at);
  const items = useMemo(() => splitItems(title), [title]);
  const [catQuery, setCatQuery] = useState('');
  const foundCats = useMemo(() => searchCategories(catQuery), [catQuery]);

  const cats = target?.kind === 'category' ? target.categories : [];
  const toggleCat = (id: CategoryId) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    setTarget(next.length ? { kind: 'category', categories: next } : null);
  };

  const valid = trigger === 'time' ? !!at : !!target;

  const save = () => {
    if (!valid) return;
    const base = {
      title: cleanTitle(title) || (trigger === 'time' ? 'تذكير' : targetLabel(target)),
      trigger,
      target: trigger === 'time' ? null : target,
      at: trigger === 'time' ? at : undefined,
      notBefore: trigger === 'time' ? undefined : draft.notBefore,
      deadline: draft.deadline,
    };
    if (draft.id) store.updateReminder(draft.id, { ...base, lastNotifiedAt: undefined, snoozedUntil: undefined });
    else store.addReminder({ id: uid(), status: 'active', createdAt: Date.now(), raw: draft.raw, ...base });
    onClose();
  };

  const remove = () => {
    Alert.alert('نحذف التذكير؟', title || undefined, [
      { text: 'لا', style: 'cancel' },
      { text: 'احذف', style: 'destructive', onPress: () => { store.deleteReminder(draft.id!); onClose(); } },
    ]);
  };

  const understood = useMemo(() => {
    const p = draft.parsed;
    if (!p) return null;
    if (p.needsTarget) return { warn: true, text: 'ما عرفت المكان ولا الوقت. اختر تحت وين أو متى تبي أذكرك.' };
    const parts = [p.trigger === 'time' ? `في وقت: ${formatWhen(p.at!)}` : TRIGGER_LABEL[p.trigger]];
    if (p.target) parts.push(targetLabel(p.target));
    if (p.title) parts.push(`«${cleanTitle(p.title)}»`);
    return { warn: false, text: parts.join(' · '), inferred: p.inferred };
  }, [draft.parsed]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.h1}>{draft.id ? 'تعديل التذكير' : 'تذكير جديد'}</Text>
            <Btn title="إغلاق" kind="ghost" onPress={onClose} />
          </View>

          {understood && (
            <View style={[S.card, { backgroundColor: understood.warn ? C.warnSoft : C.brandSoft, borderColor: 'transparent' }]}>
              <Text style={S.text}><Text style={{ fontWeight: '700' }}>{understood.warn ? 'انتبه: ' : 'فهمت: '}</Text>{understood.text}</Text>
              {understood.inferred && <Text style={S.sub}>استنتجت المكان من الغرض نفسه. عدّله لو تبي.</Text>}
            </View>
          )}

          {draft.donePlace && (
            <View style={[S.card, { backgroundColor: C.brandSoft, borderColor: 'transparent' }]}>
              <Text style={S.sub}>خلّصته من{draft.doneAt ? ` · ${formatWhen(draft.doneAt)}` : ''}</Text>
              <Text style={[S.h2, { fontSize: 20 }]}>{draft.donePlace.name}</Text>
              {placeBranch(draft.donePlace) && <Text style={[S.text, { fontWeight: '600' }]}>فرع {placeBranch(draft.donePlace)}</Text>}
              <Btn title="افتح في خرائط Google" kind="primary"
                onPress={() => openPlaceInGoogleMaps({ ...draft.donePlace!, branch: placeBranch(draft.donePlace!) })} />
            </View>
          )}

          <Text style={S.h2}>وش تبي تتذكر؟</Text>
          <TextInput style={S.input} value={title} onChangeText={setTitle} placeholder="مثال: أشتري دواء" placeholderTextColor={C.sub} />
          {items.length > 1 && (
            <>
              <Text style={S.sub}>الأغراض · اضغط على الغلط عشان تشيله</Text>
              <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 8 }}>
                {items.map((item, i) => (
                  <Pressable
                    key={`${i}-${item}`} accessibilityRole="button" accessibilityLabel={`شيل ${item}`}
                    onPress={() => setTitle(joinItems(items.filter((_, j) => j !== i)))}
                    style={({ pressed }) => ({
                      flexDirection: ROW, alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12,
                      borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={S.text}>{item}</Text>
                    <Text style={{ color: C.sub, fontSize: 16, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={S.h2}>متى أذكرك؟</Text>
          <Seg<TriggerKind>
            options={[['pass', TRIGGER_LABEL.pass], ['arrive', TRIGGER_LABEL.arrive], ['time', 'بوقت']]}
            value={trigger}
            onChange={setTrigger}
          />
          <Text style={S.sub}>
            {trigger === 'pass' && 'ننبهك وأنت تسوق لو المكان على طريقك والتحويلة تستاهل.'}
            {trigger === 'arrive' && 'ننبهك لما توصل المكان وتوقف عنده.'}
            {trigger === 'time' && 'تنبيه عادي بوقت محدد.'}
          </Text>

          {trigger === 'time' ? (
            <>
              <Text style={S.text}>{at ? formatWhen(at) : 'اختر وقت'}</Text>
              <Chips>
                {timePresets().map(([label, ts]) => (
                  <Chip key={label} label={label} on={at === ts} onPress={() => setAt(ts)} />
                ))}
              </Chips>
            </>
          ) : (
            <>
              <Text style={S.h2}>وين؟</Text>
              {target && <Text style={[S.text, { fontWeight: '700' }]}>{targetLabel(target)}</Text>}
              {target?.kind === 'place' ? (
                <Text style={S.sub}>مكان محدد من نسخة الويب. تغييره يحتاج البحث بالاسم، ويجي مع ربط Google.</Text>
              ) : (
                <>
                  <Seg<TargetMode> options={[['category', 'فئة'], ['brand', 'براند أو اسم']]} value={mode} onChange={setMode} />
                  {mode === 'category' ? (
                    <>
                      <Chips>
                        {CATEGORIES.filter((c) => !c.more || cats.includes(c.id)).map((c) => (
                          <Chip key={c.id} label={c.label} on={cats.includes(c.id)} onPress={() => toggleCat(c.id)} />
                        ))}
                      </Chips>
                      <TextInput
                        style={S.input} value={catQuery} onChangeText={setCatQuery}
                        placeholder="دوّر على نوع محل: ألعاب، جوالات، مقهى…" placeholderTextColor={C.sub}
                      />
                      {catQuery.trim().length >= 2 && (foundCats.length ? (
                        <Chips>
                          {foundCats.map((c) => (
                            <Chip
                              key={c.id} label={c.label} on={cats.includes(c.id)}
                              onPress={() => { if (!cats.includes(c.id)) toggleCat(c.id); setCatQuery(''); }}
                            />
                          ))}
                        </Chips>
                      ) : (
                        <>
                          <Text style={S.sub}>ما لقيت «{catQuery.trim()}» كفئة.</Text>
                          <Btn
                            title="دوّر عليه بالاسم"
                            onPress={() => {
                              const q = catQuery.trim();
                              setMode('brand');
                              setBrandText(q);
                              setTarget(brandFromText(q));
                              setCatQuery('');
                            }}
                          />
                        </>
                      ))}
                      <Text style={S.sub}>تقدر تختار أكثر من فئة. الفئة تعطيك فرص أكثر لأن أي فرع على طريقك ينفع.</Text>
                    </>
                  ) : (
                    <>
                      <TextInput
                        style={S.input} value={brandText} placeholder="مثال: جرير، النهدي، بنده" placeholderTextColor={C.sub}
                        onChangeText={(v) => { setBrandText(v); setTarget(brandFromText(v)); }}
                      />
                      <Chips>
                        {BRANDS.slice(0, 9).map((b) => (
                          <Chip key={b.id} label={b.label} on={target?.kind === 'brand' && target.brandId === b.id}
                            onPress={() => { setBrandText(b.label); setTarget({ kind: 'brand', brandId: b.id, label: b.label }); }} />
                        ))}
                      </Chips>
                    </>
                  )}
                </>
              )}
            </>
          )}

          <View style={[S.row, { marginTop: 8 }]}>
            <Btn title="حفظ" kind="primary" onPress={save} disabled={!valid} flex />
            {draft.id && <Btn title="حذف" kind="danger" onPress={remove} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
