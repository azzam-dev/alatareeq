// يتحقق من اسم براند كتبه المستخدم ويصححه: الجدول أول، ثم بحث TomTom بشروط (src/core/brandName.ts).
// بدون `confirm` يرجّع الاقتراح بس («تقصد: النهدي؟»)، ومع `confirm: true` (المستخدم ضغط) يحفظه في الجدول.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { brandKey, pickBrand, searchVariants, type PlaceHit } from '../_shared/brandName.ts';

interface Body {
  text?: string;
  lat?: number;
  lon?: number;
  confirm?: boolean;
}

interface BrandRow {
  id: string;
  name: string;
  key: string;
  category: string | null;
  aliases: string[];
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function findRow(rawKey: string): Promise<BrandRow | null> {
  // المفتاح من كلام المستخدم يدخل فلتر: حروف وأرقام ومسافات بس
  const key = rawKey.replace(/[^\p{L}\p{N} ]/gu, '');
  if (!key) return null;
  const { data } = await db.from('brands').select('id, name, key, category, aliases')
    .or(`key.eq."${key}",aliases.cs.{"${key}"}`).limit(1);
  return (data?.[0] as BrandRow | undefined) ?? null;
}

async function search(text: string, lat?: number, lon?: number): Promise<PlaceHit[]> {
  const params = new URLSearchParams({
    key: Deno.env.get('TOMTOM_KEY')!, countrySet: 'SA', language: 'ar', idxSet: 'POI', limit: '50', typeahead: 'false',
  });
  if (lat !== undefined && lon !== undefined) {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
    params.set('radius', '50000');
  }
  const r = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(text)}.json?${params}`);
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  const j = await r.json();
  return (j.results ?? []).map((x: { id: string; poi?: { name?: string; categorySet?: { id: number }[] } }) => ({
    id: x.id, name: x.poi?.name ?? '', categoryCode: x.poi?.categorySet?.[0]?.id,
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const text = (body.text ?? '').trim().slice(0, 60);
  const key = brandKey(text);
  if (key.replace(/\s+/g, '').length < 2) return json({ brand: null });

  const known = await findRow(key);
  if (known) return json({ brand: { name: known.name, key: known.key, category: known.category }, source: 'db' });

  // TomTom يطابق الحروف حرفيًا: نبحث بالكتابة نفسها وبـ «ي» بدل «ى» وندمج (الأكثر تكرارًا يغلب)،
  // ولو ما لقينا نضيف «ال» قدامه («نهدي» يرجّع مستودعات، و«النهدي» الصيدليات)
  const { spellings, withAl } = searchVariants(text);
  let match;
  try {
    const hits: PlaceHit[] = [];
    for (const s of spellings) hits.push(...await search(s, body.lat, body.lon));
    match = pickBrand(text, hits);
    if (!match && withAl) match = pickBrand(text, [...hits, ...await search(withAl, body.lat, body.lon)]);
  } catch {
    return json({ brand: null, error: 'search' }, 502);
  }
  if (!match) return json({ brand: null });

  const row = await findRow(match.key);
  if (body.confirm) {
    if (row) {
      if (row.key !== key && !row.aliases.includes(key)) {
        await db.from('brands').update({ aliases: [...row.aliases, key] }).eq('id', row.id);
      }
    } else {
      await db.from('brands').insert({
        name: match.name, key: match.key, category: match.category, branches: match.branches,
        aliases: key !== match.key ? [key] : [],
      });
    }
  }
  return json({
    brand: row ? { name: row.name, key: row.key, category: row.category } : { name: match.name, key: match.key, category: match.category },
    source: 'tomtom',
  });
});
