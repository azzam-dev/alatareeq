import {
  ARRIVE_VERBS, BRANDS, CATEGORIES, COMMANDS, CONDITIONALS, CONNECTORS, ITEM_CATEGORIES, PASS_VERBS,
  PLACE_MODIFIERS, PREPS, ROUTE_PHRASES, TASK_VERBS, type CategoryDef,
} from './lexicon';
import { normalize, stems, tokenize, type Tok } from './normalize';
import { parseTime } from './time';
import type { CategoryId, Target, TriggerKind } from './types';

export interface ParsedReminder {
  title: string;
  trigger: TriggerKind;
  target: Target | null;
  at?: number;
  notBefore?: number;
  deadline?: number;
  /** الفئات جات من الغرض نفسه، مو من كلمة مكان صريحة */
  inferred: boolean;
  /** ما عرفنا المكان ولا الوقت: المحرر يطلب من المستخدم يحدد */
  needsTarget: boolean;
  /** الوقت اللي انقال فيه ساعة («الساعة ٥»)، مو يوم بس («بكرة») */
  hasClock?: boolean;
}

interface Match { start: number; end: number } // end حصري

const phrase = (s: string) => normalize(s).split(/\s+/);
const has = (list: string[], t: string) => list.includes(t);

/** يطابق عبارة (كلمة أو أكثر) عند الموضع i. الكلمة الأولى تُقارن بصيغها بدون «ال» وحروف الجر */
function matchPhraseAt(toks: Tok[], i: number, words: string[]): Match | null {
  let best: Match | null = null;
  for (const w of words) {
    const parts = phrase(w);
    if (i + parts.length > toks.length) continue;
    let ok = true;
    for (let k = 0; k < parts.length; k++) {
      const cand = stems(toks[i + k].norm);
      if (!cand.includes(parts[k])) { ok = false; break; }
    }
    if (ok && (!best || i + parts.length > best.end)) best = { start: i, end: i + parts.length };
  }
  return best;
}

function isStop(t: string): boolean {
  return has(TASK_VERBS, t) || has(CONNECTORS, t) || has(COMMANDS, t) || has(CONDITIONALS, t) ||
    t === 'الساعه' || t === 'بكره' || t === 'بعد' || t === 'قبل' || t === 'اليوم' || t === 'الليله';
}

function isItemWord(t: string): boolean {
  return ITEM_CATEGORIES.some(([words]) => stems(t).some((s) => words.includes(s)));
}

interface PlaceHit { target: Target; match: Match }

/** يحاول يلقى مكان (براند، فئة، أو اسم حر) يبدأ عند i */
function placeAt(toks: Tok[], i: number, allowFree: boolean): PlaceHit | null {
  let start = i;
  while (start < toks.length && has(PLACE_MODIFIERS, toks[start].norm)) start++;
  if (start >= toks.length) return null;

  for (const b of BRANDS) {
    const m = matchPhraseAt(toks, start, b.words);
    if (m) return { target: { kind: 'brand', brandId: b.id, label: b.label }, match: { start: i, end: m.end } };
  }

  // أطول اسم فئة يغلب: «مغسلة سيارات» مو «مغسلة». البضاعة («ألعاب») فئة بعد «محل» بس، ولحالها غرض
  let best: { c: CategoryDef; m: Match } | null = null;
  for (const c of CATEGORIES) {
    const m = matchPhraseAt(toks, start, start > i && c.goods ? [...c.words, ...c.goods] : c.words);
    if (m && (!best || m.end > best.m.end)) best = { c, m };
  }
  if (best) {
    const { c, m } = best;
    // «مكتبة الجامعة»: فئة + اسم معرّف ← اسم مكان حر.
    // الفئات الإضافية أسماؤها غالبًا بدون «ال»: «كافيه دوز»، «صراف الراجحي»
    const extra: number[] = [];
    let k = m.end;
    while (k < toks.length && extra.length < 3) {
      const t = toks[k].norm;
      if ((!t.startsWith('ال') && !c.more) || isStop(t) || isItemWord(t) || parseTime([toks[k]], new Date())) break;
      extra.push(k++);
    }
    if (extra.length) {
      const label = toks.slice(start, k).map((t) => t.orig).join(' ');
      return { target: { kind: 'brand', brandId: `name:${label}`, label }, match: { start: i, end: k } };
    }
    return { target: { kind: 'category', categories: [c.id] }, match: { start: i, end: m.end } };
  }

  if (!allowFree) return null;
  const words: number[] = [];
  let k = start;
  while (k < toks.length && words.length < 4) {
    const t = toks[k].norm;
    if (!t || isStop(t)) break;
    words.push(k++);
  }
  if (!words.length) return null;
  const label = toks.slice(start, k).map((t) => t.orig.replace(/[،,.؟?!]+$/, '')).join(' ');
  return { target: { kind: 'brand', brandId: `name:${label}`, label }, match: { start: i, end: k } };
}

export function parseReminder(text: string, now: Date = new Date()): ParsedReminder {
  const toks = tokenize(text.trim());
  const used = new Set<number>();
  const use = (a: number, b: number) => { for (let k = a; k < b; k++) used.add(k); };
  const n = (i: number) => toks[i]?.norm ?? '';

  // ١) أوامر «ذكرني» في أي مكان + «اني/ان» بعدها
  toks.forEach((t, i) => {
    if (has(COMMANDS, t.norm)) {
      used.add(i);
      if (['اني', 'ان', 'انه', 'بـ'].includes(n(i + 1))) used.add(i + 1);
    }
  });

  // ٢) التريغر
  let trigger: TriggerKind | null = null;
  let placeFrom = -1;
  for (let i = 0; i < toks.length && trigger === null; i++) {
    if (used.has(i)) continue;
    const route = matchPhraseAt(toks, i, ROUTE_PHRASES);
    if (route) {
      trigger = 'pass';
      use(route.start, route.end);
      placeFrom = route.end;
      continue;
    }
    // «إذا مريت» / «لما أوصل» / «أول ما أوصل» / «عند وصولي»
    const vi = n(i) === 'اول' && n(i + 1) === 'ما' ? i + 2 : has(CONDITIONALS, n(i)) ? i + 1 : -1;
    if (vi < 0) continue;
    const pass = matchPhraseAt(toks, vi, PASS_VERBS);
    const verb = pass ?? matchPhraseAt(toks, vi, ARRIVE_VERBS);
    if (!verb) continue;
    trigger = pass ? 'pass' : 'arrive';
    use(i, verb.end);
    let p = verb.end;
    while (p < toks.length && has(PREPS, n(p))) { used.add(p); p++; }
    placeFrom = p;
  }

  // ٣) المكان
  let target: Target | null = null;
  if (placeFrom >= 0) {
    const hit = placeAt(toks, placeFrom, true);
    if (hit) { target = hit.target; use(hit.match.start, hit.match.end); }
  }
  if (!target) {
    for (let i = 0; i < toks.length; i++) {
      if (used.has(i)) continue;
      const hit = placeAt(toks, i, false);
      if (!hit) continue;
      target = hit.target;
      use(hit.match.start, hit.match.end);
      // «في الصيدلية» / «عند جرير» بدون فعل ← وصول
      const prev = n(i - 1);
      if (!trigger && (prev === 'في' || prev === 'عند') && !used.has(i - 1)) { trigger = 'arrive'; used.add(i - 1); }
      else if (!trigger && ['على', 'من', 'جنب', 'ب'].includes(prev) && !used.has(i - 1)) { used.add(i - 1); }
      break;
    }
  }

  // ٤) الوقت (على الكلمات الباقية فقط)
  const restIdx = toks.map((_, i) => i).filter((i) => !used.has(i));
  const timeMatch = parseTime(restIdx.map((i) => toks[i]), now);
  if (timeMatch) timeMatch.consumed.forEach((k) => used.add(restIdx[k]));

  // ٥) العنوان من الكلمات الباقية
  let titleToks = toks.filter((_, i) => !used.has(i));
  while (titleToks.length && (has(CONNECTORS, titleToks[0].norm) || /^[،,.:\-–—]+$/.test(titleToks[0].orig))) titleToks.shift();
  while (titleToks.length && (has(CONNECTORS, titleToks[titleToks.length - 1].norm) || /^[،,.:\-–—]+$/.test(titleToks[titleToks.length - 1].orig))) titleToks.pop();
  if (titleToks.length && /^بال/.test(titleToks[0].norm)) {
    titleToks = [{ ...titleToks[0], orig: titleToks[0].orig.replace(/^ب/, '') }, ...titleToks.slice(1)];
  }
  let title = titleToks.map((t) => t.orig).join(' ').replace(/[،,]+$/, '').trim();

  // ٦) استنتاج الفئة من الغرض
  let inferred = false;
  if (!target && (!timeMatch || trigger === 'pass')) {
    const cats: CategoryId[] = [];
    for (const t of titleToks) {
      for (const [words, cs] of ITEM_CATEGORIES) {
        if (stems(t.norm).some((s) => words.includes(s))) for (const c of cs) if (!cats.includes(c)) cats.push(c);
      }
    }
    if (cats.length) { target = { kind: 'category', categories: cats }; inferred = true; }
  }

  const out: ParsedReminder = { title, trigger: 'pass', target, inferred, needsTarget: false };
  if (timeMatch) out.hasClock = timeMatch.hasClock;
  if (target) {
    out.trigger = trigger === 'arrive' ? 'arrive' : 'pass';
    if (timeMatch) {
      if (timeMatch.deadline) out.deadline = endOf(timeMatch);
      else out.notBefore = timeMatch.hasClock ? timeMatch.date.getTime() : startOfDay(timeMatch.date);
    }
  } else if (timeMatch) {
    out.trigger = 'time';
    out.at = timeMatch.date.getTime();
  } else {
    out.trigger = trigger ?? 'pass';
    out.needsTarget = true;
  }
  if (!title) title = out.trigger === 'time' ? 'تذكير' : '';
  out.title = title;
  return out;
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOf(m: { date: Date; hasClock: boolean }): number {
  if (m.hasClock) return m.date.getTime();
  const x = new Date(m.date);
  x.setHours(0, 0, 0, 0); // «قبل الخميس» = قبل بداية الخميس
  return x.getTime();
}
