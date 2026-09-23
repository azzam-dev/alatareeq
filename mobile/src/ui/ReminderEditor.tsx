import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { brandKey } from '../../../src/core/brandName';
import { targetLabel } from '../../../src/core/compose';
import { cleanTitle, joinItems, splitItems } from '../../../src/core/items';
import { BRANDS } from '../../../src/core/lexicon';
import { normalize, stems } from '../../../src/core/normalize';
import type { Priority, Reminder, RemindBefore, SpecificPlace, Target } from '../../../src/core/types';
import { confirmBrand, type BrandSuggestion } from '../services/brands';
import { confirmDelete, openPlaceInGoogleMaps } from '../services/device';
import { store, uid } from '../state/store';
import { BrandField } from './BrandField';
import { CategoryPicker } from './CategoryPicker';
import { DeadlineField } from './DeadlineField';
import { formatWhen, placeBranch, PRIORITY_LABEL } from './format';
import { Btn, HelpTitle, Seg } from './parts';
import { C, ROW, S } from './theme';

export interface Draft {
  id?: string;
  title: string;
  target: Target | null;
  notBefore?: number;
  /** آخر موعد للغرض */
  deadline?: number;
  priority?: Priority;
  remindBefore?: RemindBefore;
  raw?: string;
  /** رسالة فوق المحرر، مثل «اختر وين تبي أذكرك» */
  notice?: string;
  donePlace?: SpecificPlace;
  doneAt?: number;
}

export function draftFromReminder(r: Reminder): Draft {
  return {
    id: r.id, title: r.title, target: r.target, notBefore: r.notBefore, deadline: r.deadline, priority: r.priority,
    remindBefore: r.remindBefore, raw: r.raw, donePlace: r.status === 'done' ? r.donePlace : undefined, doneAt: r.doneAt,
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

export function ReminderEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [target, setTarget] = useState<Target | null>(draft.target);
  const [deadline, setDeadline] = useState<number | undefined>(draft.deadline);
  const [priority, setPriority] = useState<Priority>(draft.priority ?? 'normal');
  const [remind, setRemind] = useState<RemindBefore | undefined>(draft.remindBefore);
  const [mode, setMode] = useState<TargetMode>(draft.target?.kind === 'brand' ? 'brand' : 'category');
  const [brandText, setBrandText] = useState(draft.target?.kind === 'brand' ? draft.target.label : '');
  // البراند اللي أكده السيرفر للاسم الحالي، وينحفظ للكل مع الحفظ لو مكتوب صح
  const [verified, setVerified] = useState<BrandSuggestion | null>(null);
  const items = useMemo(() => splitItems(title), [title]);

  const cats = target?.kind === 'category' ? target.categories : [];
  // القاموس يعرف «باندا» = بنده: نتحقق من الاسم الصحيح، مو من الكتابة («الباندا» محلات اتصالات)
  const brandQuery = target?.kind === 'brand' && !target.brandId.startsWith('name:') ? target.label : brandText;

  // كل تذكير لازم يكون له محل
  const valid = !!target;

  const save = () => {
    if (!target) return;
    if (target.kind === 'brand' && verified && verified.key === brandKey(brandQuery)) confirmBrand(brandQuery);
    const base = {
      title: cleanTitle(title) || targetLabel(target),
      trigger: 'pass' as const,
      target,
      notBefore: draft.notBefore,
      deadline,
      priority,
      // الافتراضي ما ينحفظ، واللي ما يناسب نوع الموعد يرجع للافتراضي وقت التنبيه
      remindBefore: deadline === undefined ? undefined : remind,
    };
    // كل غرض تذكير مستقل: الأول يحدّث هذا التذكير، والباقي تذاكير جديدة بنفس المحل والموعد والأولوية
    // (تذكير خلص ما ينقسم، عشان ما يرجع منه تذاكير نشطة)
    const [first, ...rest] = items.length > 1 && !draft.doneAt ? items : [base.title];
    if (draft.id) store.updateReminder(draft.id, { ...base, title: first, lastNotifiedAt: undefined, snoozedUntil: undefined });
    else store.addReminder({ id: uid(), status: 'active', createdAt: Date.now(), raw: draft.raw, ...base, title: first });
    for (const item of rest) store.addReminder({ id: uid(), status: 'active', createdAt: Date.now(), raw: draft.raw, ...base, title: item });
    onClose();
  };

  const remove = () => {
    confirmDelete('نحذف التذكير؟', title || undefined, () => { store.deleteReminder(draft.id!); onClose(); });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.h1}>{draft.id ? 'تعديل التذكير' : 'تذكير جديد'}</Text>
            <Btn title="إغلاق" kind="ghost" onPress={onClose} />
          </View>

          {draft.notice && !target && <Text style={S.note}>{draft.notice}</Text>}

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
          <TextInput style={S.input} value={title} onChangeText={setTitle} placeholder="مثال: خبز وحليب" placeholderTextColor={C.sub} />
          {items.length > 1 && (
            <>
              <Text style={S.sub}>الأغراض</Text>
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

          <Text style={S.sub}>الأولوية</Text>
          <Seg<Priority>
            options={(['high', 'normal', 'low'] as const).map((p): [Priority, string] => [p, PRIORITY_LABEL[p]])}
            value={priority} onChange={setPriority}
          />

          <DeadlineField deadline={deadline} remind={remind} onChange={setDeadline} onRemindChange={setRemind} />

          <HelpTitle title="وين؟" help="تقدر تختار أكثر من فئة. الفئة تعطيك فرص أكثر لأن أي فرع على طريقك ينفع." />
          {target && <Text style={[S.text, { fontWeight: '700' }]}>{targetLabel(target)}</Text>}
          {target?.kind !== 'place' && (
            <>
              <Seg<TargetMode> options={[['category', 'فئة'], ['brand', 'براند أو اسم']]} value={mode} onChange={setMode} />
              {mode === 'category' ? (
                <CategoryPicker
                  title={title} value={cats}
                  onChange={(next) => setTarget(next.length ? { kind: 'category', categories: next } : null)}
                  onSearchName={(q) => {
                    setMode('brand');
                    setBrandText(q);
                    setTarget(brandFromText(q));
                  }}
                />
              ) : (
                <BrandField
                  value={brandText} query={brandQuery} onVerified={setVerified}
                  onChange={(v) => { setBrandText(v); setTarget(brandFromText(v)); }}
                  onAccept={(b) => {
                    // «تقصد» ينحفظ للكل ومعه الخطأ اللي كتبه («جريير» ← جرير)
                    confirmBrand(brandQuery);
                    setBrandText(b.name);
                    setTarget(brandFromText(b.name));
                  }}
                />
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
