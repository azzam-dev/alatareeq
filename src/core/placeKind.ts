import { BRANDS, CATEGORIES, CATEGORY_BY_ID, type CategoryDef } from './lexicon';
import { normalize, stems } from './normalize';
import type { CategoryId, Place } from './types';

/** كلمات كل اسم، ولكل كلمة صيغها بدون «ال» وحروف الجر */
function nameTokens(names: string[]): string[][][] {
  return names.map((n) => normalize(n).split(/[^0-9a-z؀-ۿ]+/).filter(Boolean).map(stems));
}

/** هل واحد من الأسماء فيه كلمة أو عبارة من القائمة؟ كلمات كاملة فقط: «العابدين» مو «العاب» */
export function nameMentions(names: string[], words: string[]): boolean {
  const phrases = words.map((w) => w.split(' '));
  return nameTokens(names).some((toks) =>
    phrases.some((p) => toks.some((_, i) => p.every((part, k) => toks[i + k]?.includes(part)))));
}

/** فئات المكان ونوعه من وسوم OSM، بعد استبعاد الفئات اللي اسمه يناقضها */
export function classifyPlace(tags: Record<string, string>, names: string[]): { categories: CategoryId[]; kind?: string } {
  const categories = CATEGORIES
    .filter((c) => c.osm.some(([k, v]) => tags[k] === v) && !nameMentions(names, c.excludeWords))
    .map((c) => c.id);
  for (const c of CATEGORIES) {
    if (!categories.includes(c.id)) continue;
    const hit = c.osm.find(([k, v]) => tags[k] === v);
    if (hit) return { categories, kind: `${hit[0]}=${hit[1]}` };
  }
  return { categories };
}

const BRAND_RES = new Map(CATEGORIES.map((c) => [c.id, BRANDS.filter((b) => b.category === c.id).map((b) => new RegExp(b.osmRegex, 'i'))]));

function kindDef(place: Place): { category: CategoryDef; label: string } | undefined {
  for (const c of CATEGORIES) {
    const hit = c.osm.find(([k, v]) => place.kind === `${k}=${v}`);
    if (hit) return { category: c, label: hit[2] };
  }
  const id = place.categories[0];
  return id ? { category: CATEGORY_BY_ID[id], label: CATEGORY_BY_ID[id].label } : undefined;
}

/** نوع المكان للعرض («سوبرماركت»)، وهل اسمه يدل عليه أصلًا («أسواق التميمي»، «بنده») */
export function placeKind(place: Place): { label: string; named: boolean } | undefined {
  const def = kindDef(place);
  if (!def) return undefined;
  const c = def.category;
  const named = !!place.name && (
    nameMentions([place.name], [...c.words, ...c.nameWords]) || BRAND_RES.get(c.id)!.some((re) => re.test(place.name)));
  return { label: def.label, named };
}
