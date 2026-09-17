// أماكن TomTom للمربعات اللي قدام السائق: المحفوظ (أحدث من ٩٠ يوم) يرجع على طول، والناقص نسأل عنه TomTom ونحفظه للكل.
// سؤال واحد لكل مربع عن كل أنواعه الناقصة، وكل نوع له حصة من رصيد الشهر على قد ما انطلب (جدول tomtom_budget).
// الطلب: { tiles: ["1834:3113", ...], categories: ["pharmacy", ...] }
// الرد: { places: TilePlace[], done: ["1834:3113|pharmacy", ...] (اللي تغطى ولو فاضي), pending: عدد اللي ما لحقنا أو ما بقى له رصيد }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  affordable, chargeFetch, combineCategories, inTile, isTileId, recordDemand, splitByCategory, TILE_SEARCH_RADIUS_M,
  TILE_TTL_DAYS, tileCenter, TOMTOM_CODES, TOMTOM_MAX_RESULTS, type BudgetState, type RawPlace, type TilePlace,
} from '../_shared/placeTiles.ts';
import type { CategoryId } from '../_shared/types.ts';

/** حدود الطلب الواحد، عشان ما ينصرف رصيد TomTom بطلب واحد */
const MAX_TILES = 30;
const MAX_CATEGORIES = 8;
/** أقصى أسئلة TomTom جديدة لكل طلب، والباقي ينطلب بالمرة الجاية */
const MAX_FETCHES = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

interface TomTomResult {
  id: string;
  position: { lat: number; lon: number };
  poi?: { name?: string; brands?: { name: string }[]; categorySet?: { id: number }[] };
  address?: { municipalitySubdivision?: string; streetName?: string };
}

/** سؤال واحد لـ TomTom عن أنواع في مربع. يرجّع النتائج داخل المربع، وهل وصل حد الـ١٠٠ */
async function ask(tile: string, categories: CategoryId[]): Promise<{ places: RawPlace[]; full: boolean }> {
  const c = tileCenter(tile);
  const params = new URLSearchParams({
    key: Deno.env.get('TOMTOM_KEY')!, lat: String(c.lat), lon: String(c.lon), radius: String(TILE_SEARCH_RADIUS_M),
    categorySet: categories.flatMap((cat) => TOMTOM_CODES[cat] ?? []).join(','),
    limit: String(TOMTOM_MAX_RESULTS), language: 'ar', countrySet: 'SA',
  });
  const r = await fetch(`https://api.tomtom.com/search/2/nearbySearch/.json?${params}`);
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  const results = ((await r.json()).results ?? []) as TomTomResult[];
  return {
    full: results.length >= TOMTOM_MAX_RESULTS,
    places: results
      // البحث دائرة حول وسط المربع: نحفظ اللي داخل المربع بس، والمربعات الجارة تجيب الباقي
      .filter((x) => x.poi?.name && inTile(tile, x.position.lat, x.position.lon))
      .map((x) => ({
        id: `tt:${x.id}`,
        name: x.poi!.name!,
        lat: x.position.lat,
        lon: x.position.lon,
        codes: (x.poi!.categorySet ?? []).map((s) => s.id),
        branch: x.address?.municipalitySubdivision || x.address?.streetName || undefined,
        brandNames: x.poi!.brands?.map((b) => b.name).filter(Boolean),
      })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { tiles?: unknown; categories?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const tiles = (Array.isArray(body.tiles) ? body.tiles : []).filter((t): t is string => typeof t === 'string' && isTileId(t))
    .slice(0, MAX_TILES);
  const categories = [...new Set((Array.isArray(body.categories) ? body.categories : [])
    .filter((c): c is CategoryId => typeof c === 'string' && Array.isArray(TOMTOM_CODES[c as CategoryId])))]
    .slice(0, MAX_CATEGORIES);
  if (!tiles.length || !categories.length) return json({ places: [], done: [], pending: 0 });

  const since = new Date(Date.now() - TILE_TTL_DAYS * 86_400_000).toISOString();
  const { data: cached } = await db.from('place_tiles').select('tile, category, places')
    .in('tile', tiles).in('category', categories).gte('fetched_at', since);
  const have = new Set((cached ?? []).map((r) => `${r.tile}|${r.category}`));
  const done = [...have];
  const places: TilePlace[] = (cached ?? []).flatMap((r) => r.places as TilePlace[]);

  // رصيد الشهر: نسجل إن هالأنواع انطلبت، وبعدها نشوف حصة كل نوع
  const month = new Date().toISOString().slice(0, 7);
  const { data: rows } = await db.from('tomtom_budget').select('category, demand, spent').eq('month', month);
  const state: BudgetState = {};
  for (const r of rows ?? []) state[r.category as CategoryId] = { demand: r.demand, spent: Number(r.spent) };
  recordDemand(state, categories);

  // المربعات مرتبة بالأقرب من التطبيق، فنجيب الأقرب أول
  let fetches = 0;
  let pending = 0;
  const save = async (tile: string, byCategory: Map<CategoryId, TilePlace[]>) => {
    const now = new Date().toISOString();
    await db.from('place_tiles').upsert([...byCategory].map(([category, list]) => ({ tile, category, places: list, fetched_at: now })));
    for (const [category, list] of byCategory) {
      places.push(...list);
      done.push(`${tile}|${category}`);
    }
  };

  for (const tile of tiles) {
    const missing = categories.filter((c) => !have.has(`${tile}|${c}`));
    if (!missing.length) continue;
    const allowed = affordable(missing, state);
    pending += missing.length - allowed.length;
    for (const group of combineCategories(allowed)) {
      if (fetches >= MAX_FETCHES) { pending += group.length; continue; }
      try {
        fetches++;
        chargeFetch(state, group);
        const got = await ask(tile, group);
        if (!got.full || group.length === 1) {
          await save(tile, splitByCategory(got.places, group));
          continue;
        }
        // وصل حد الـ١٠٠ والسؤال فيه كذا نوع: ممكن نقصت محلات، فنسأل عن كل نوع لحاله
        for (const cat of group) {
          if (fetches >= MAX_FETCHES || !affordable([cat], state).length) { pending++; continue; }
          fetches++;
          chargeFetch(state, [cat]);
          const one = await ask(tile, [cat]);
          await save(tile, splitByCategory(one.places, [cat]));
        }
      } catch {
        pending += group.length;
      }
    }
  }

  await db.from('tomtom_budget').upsert(
    (Object.entries(state) as [CategoryId, { demand: number; spent: number }][])
      .map(([category, u]) => ({ month, category, demand: u.demand, spent: u.spent })),
  );
  return json({ places, done, pending });
});
