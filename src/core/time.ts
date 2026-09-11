import { stems, type Tok } from './normalize';

export interface TimeMatch {
  date: Date;
  /** المستخدم حدد ساعة، مو بس يوم */
  hasClock: boolean;
  /** سُبقت بـ «قبل» */
  deadline: boolean;
  consumed: number[];
}

const NUM_WORDS: Record<string, number> = {
  واحده: 1, وحده: 1, واحد: 1, ثنتين: 2, اثنين: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4,
  خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, ثمنيه: 8, تسع: 9, تسعه: 9,
  عشر: 10, عشره: 10, احدعش: 11, حدعش: 11, احدعشر: 11, اثنعش: 12, اطناش: 12, ثنعش: 12, اثنعشر: 12,
};

type Period = 'am' | 'noon' | 'pm' | 'night';
const PERIODS: Record<string, [Period, number]> = {
  // الكلمة: [الفترة، الساعة الافتراضية لو ما فيه ساعة]
  صبح: ['am', 8], صباحا: ['am', 8], صباح: ['am', 8], فجر: ['am', 5], ضحي: ['am', 10], ص: ['am', 8],
  ظهر: ['noon', 12], ظهرا: ['noon', 12],
  عصر: ['pm', 16], عصرا: ['pm', 16], مغرب: ['pm', 18], مسا: ['pm', 19], مساء: ['pm', 19], مساءا: ['pm', 19],
  عشا: ['pm', 20], عشاء: ['pm', 20], م: ['pm', 19],
  ليل: ['night', 21], بالليل: ['night', 21], ليله: ['night', 21],
};

const WEEKDAYS: Record<string, number> = {
  احد: 0, اثنين: 1, اتنين: 1, ثنين: 1, ثلاثاء: 2, ثلاثا: 2, ثلوث: 2, اربعاء: 3, اربعا: 3, ربوع: 3,
  خميس: 4, جمعه: 5, سبت: 6,
};

const REL_UNITS: Record<string, { min: number; needsNum: boolean }> = {
  ساعه: { min: 60, needsNum: false }, ساعات: { min: 60, needsNum: true }, ساعتين: { min: 120, needsNum: false },
  دقيقه: { min: 1, needsNum: true }, دقايق: { min: 1, needsNum: true }, دقائق: { min: 1, needsNum: true },
  دقيقتين: { min: 2, needsNum: false }, يوم: { min: 1440, needsNum: false }, يومين: { min: 2880, needsNum: false },
  ايام: { min: 1440, needsNum: true }, اسبوع: { min: 10080, needsNum: false },
};

function lookup<T>(table: Record<string, T>, norm: string): T | undefined {
  for (const s of stems(norm)) if (s in table) return table[s];
  return undefined;
}

function parseNum(norm: string): number | undefined {
  if (/^\d{1,3}$/.test(norm)) return Number(norm);
  return NUM_WORDS[norm];
}

export function parseTime(toks: Tok[], now: Date): TimeMatch | null {
  const consumed = new Set<number>();
  let dayOffset: number | null = null;
  let weekday: number | null = null;
  let hour: number | null = null;
  let minute = 0;
  let period: Period | null = null;
  let periodDefault: number | null = null;
  let relMin: number | null = null;
  let deadline = false;
  let firstIdx = -1;

  const mark = (...idx: number[]) => {
    for (const i of idx) {
      consumed.add(i);
      if (firstIdx < 0 || i < firstIdx) firstIdx = i;
    }
  };
  const n = (i: number) => toks[i]?.norm ?? '';

  for (let i = 0; i < toks.length; i++) {
    if (consumed.has(i)) continue;
    const t = n(i);

    // أيام نسبية
    if (['بكره', 'بكرا', 'غدا', 'باكر', 'بكرى'].includes(t)) {
      if (n(i - 1) === 'بعد') { dayOffset = 2; mark(i - 1, i); } else { dayOffset = 1; mark(i); }
      continue;
    }
    if (t === 'اليوم') { dayOffset = 0; mark(i); continue; }
    if (t === 'الليله') { dayOffset = dayOffset ?? 0; period = 'night'; periodDefault = 21; mark(i); continue; }

    // أيام الأسبوع
    const wd = lookup(WEEKDAYS, t);
    if (wd !== undefined && (t.startsWith('ال') || n(i - 1) === 'يوم')) {
      weekday = wd;
      mark(i);
      if (n(i - 1) === 'يوم') mark(i - 1);
      continue;
    }

    // بعد + (رقم)? + وحدة
    if (t === 'بعد') {
      let j = i + 1;
      let num: number | undefined;
      let frac = 1;
      if (n(j) === 'نص' || n(j) === 'نصف') { frac = 0.5; j++; }
      else if (n(j) === 'ربع') { frac = 0.25; j++; }
      else if (parseNum(n(j)) !== undefined) { num = parseNum(n(j)); j++; }
      const unit = REL_UNITS[n(j)];
      if (unit && (!unit.needsNum || num !== undefined)) {
        relMin = (num ?? 1) * unit.min * frac;
        mark(...range(i, j));
        i = j;
        continue;
      }
    }

    // الساعة ٥ / ٥:٣٠ / ٥م
    let h: number | undefined;
    let m = 0;
    let span = [i];
    const clock = t.match(/^(\d{1,2})(?::(\d{2}))?(ص|م)?$/);
    if (t === 'الساعه' || t === 'ساعه') {
      const nx = n(i + 1);
      const c2 = nx.match(/^(\d{1,2})(?::(\d{2}))?(ص|م)?$/);
      if (c2) {
        h = Number(c2[1]); m = Number(c2[2] ?? 0); span = [i, i + 1];
        if (c2[3]) { period = c2[3] === 'ص' ? 'am' : 'pm'; }
      } else if (NUM_WORDS[nx] !== undefined) {
        h = NUM_WORDS[nx]; span = [i, i + 1];
      }
    } else if (clock && (clock[2] || clock[3] || lookup(PERIODS, n(i + 1)) || n(i - 1) === 'قبل')) {
      h = Number(clock[1]); m = Number(clock[2] ?? 0);
      if (clock[3]) period = clock[3] === 'ص' ? 'am' : 'pm';
    }
    if (h !== undefined && h <= 24 && m < 60) {
      let k = span[span.length - 1] + 1;
      if (n(k) === 'ونص') { m = 30; span.push(k++); }
      else if (n(k) === 'وربع') { m = 15; span.push(k++); }
      else if (n(k) === 'وثلث') { m = 20; span.push(k++); }
      else if (n(k) === 'الا' && n(k + 1) === 'ربع') { h = h - 1; m = 45; span.push(k, k + 1); k += 2; }
      hour = h; minute = m;
      mark(...span);
      i = span[span.length - 1];
      continue;
    }

    // الفترة: العصر، الصبح، م ...
    const p = lookup(PERIODS, t);
    if (p && (t.length > 1 || hour !== null)) {
      period = p[0]; periodDefault = p[1];
      mark(i);
      if (n(i - 1) === 'في' || n(i - 1) === 'وقت') mark(i - 1);
    }
  }

  if (firstIdx < 0) return null;
  if (n(firstIdx - 1) === 'قبل') { deadline = true; mark(firstIdx - 1); }

  let date: Date;
  let hasClock = true;
  if (relMin !== null) {
    date = new Date(now.getTime() + relMin * 60_000);
  } else {
    date = new Date(now);
    date.setSeconds(0, 0);
    const explicitDay = dayOffset !== null || weekday !== null;
    if (weekday !== null) {
      let diff = (weekday - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      date.setDate(date.getDate() + diff);
    } else if (dayOffset) {
      date.setDate(date.getDate() + dayOffset);
    }

    if (hour !== null) {
      const hr = resolveHour(hour, period, explicitDay, now, date, minute);
      date.setHours(hr.h, minute);
      if (hr.nextDay) date.setDate(date.getDate() + 1);
    } else if (periodDefault !== null) {
      date.setHours(periodDefault, 0);
      if (!explicitDay && date <= now) date.setDate(date.getDate() + 1);
    } else {
      hasClock = false;
      date.setHours(9, 0);
    }
  }

  return { date, hasClock, deadline, consumed: [...consumed].sort((a, b) => a - b) };
}

function resolveHour(h: number, period: Period | null, explicitDay: boolean, now: Date, day: Date, minute: number) {
  if (h >= 13) return { h: h % 24, nextDay: false };
  switch (period) {
    case 'am': return { h: h === 12 ? 0 : h, nextDay: false };
    case 'noon': return { h: h >= 11 ? h : h + 12, nextDay: false };
    case 'pm': return { h: h === 12 ? 12 : h + 12, nextDay: false };
    case 'night':
      if (h >= 6 && h <= 11) return { h: h + 12, nextDay: false };
      return { h: h === 12 ? 0 : h, nextDay: true };
  }
  if (explicitDay) {
    // بدون فترة ومع يوم: ١–٦ غالبًا عصر، ٧–١١ صباح
    if (h >= 1 && h <= 6) return { h: h + 12, nextDay: false };
    return { h: h === 12 ? 12 : h, nextDay: false };
  }
  // بدون يوم وبدون فترة: أقرب وقت قادم
  const options = h === 12 ? [12, 24] : [h, h + 12, h + 24];
  for (const o of options) {
    const d = new Date(day);
    d.setHours(o % 24, minute, 0, 0);
    if (o >= 24) d.setDate(d.getDate() + 1);
    if (d > now) return { h: o % 24, nextDay: o >= 24 };
  }
  return { h, nextDay: true };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
