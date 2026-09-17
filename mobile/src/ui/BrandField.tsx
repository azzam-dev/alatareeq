import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { brandKey } from '../../../src/core/brandName';
import { CATEGORY_BY_ID } from '../../../src/core/lexicon';
import { suggestBrand, type BrandSuggestion } from '../services/brands';
import { C, S } from './theme';

/** بعد ما يوقف عن الكتابة */
const WAIT_MS = 600;

/**
 * «براند أو اسم»: خانة، وتحتها بعد ما يوقف يكتب «تقصد: النهدي (صيدلية)؟» يضغطه، أو «✓ النهدي · صيدلية» لو كتبه صح،
 * أو إنه ينحفظ له مثل ما كتبه لو مو سلسلة محلات. التصحيح من السيرفر (`verify-brand`)، وبدون نت ما يطلع شي.
 */
export function BrandField({ value, query, onChange, onAccept, onVerified }: {
  value: string;
  /** الاسم اللي نتحقق منه: الاسم المعروف لو القاموس عرفه («باندا» ← «بنده»)، وإلا المكتوب */
  query: string;
  onChange: (text: string) => void;
  /** ضغط «تقصد» */
  onAccept: (s: BrandSuggestion) => void;
  /** نتيجة التحقق للاسم الحالي (null = مو سلسلة معروفة أو ما تحقق) */
  onVerified: (s: BrandSuggestion | null) => void;
}) {
  const [checked, setChecked] = useState<{ text: string; brand: BrandSuggestion | null } | null>(null);
  const text = query.trim();

  useEffect(() => {
    onVerified(null);
    if (brandKey(text).replace(/\s+/g, '').length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      void suggestBrand(text).then((brand) => {
        if (!alive) return;
        setChecked({ text, brand });
        onVerified(brand);
      });
    }, WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
    // onVerified من المحرر يتغير كل رسم، والتحقق يعتمد على النص بس
  }, [text]);

  const result = checked?.text === text ? checked : null;
  const brand = result?.brand;
  const category = brand?.category ? CATEGORY_BY_ID[brand.category]?.label : undefined;
  // «جرير» و«الدانوب» مكتوبة صح حتى لو فرقت «ال»
  const exact = brand && brandKey(brand.name) === brandKey(text);

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        style={S.input} value={value} onChangeText={onChange}
        placeholder="اكتب اسم المحل" placeholderTextColor={C.sub}
      />
      {brand && exact && (
        <Text style={[S.sub, { color: C.brand, fontWeight: '600' }]}>✓ {brand.name}{category ? ` · ${category}` : ''}</Text>
      )}
      {brand && !exact && (
        <Pressable
          accessibilityRole="button" onPress={() => onAccept(brand)}
          style={({ pressed }) => [{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.brandSoft }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[S.text, { color: C.brand, fontWeight: '700' }]}>تقصد: {brand.name}{category ? ` (${category})` : ''}؟</Text>
        </Pressable>
      )}
      {result && !brand && <Text style={S.sub}>ما لقيناه كسلسلة محلات، بينحفظ لك مثل ما كتبته.</Text>}
    </View>
  );
}
