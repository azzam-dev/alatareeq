import { BRAND_BY_ID, CATEGORY_BY_ID } from './lexicon';
import { placeKind } from './placeKind';
import type { Place, Reminder, Settings, SuppressReason, Target } from './types';

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} م`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace(/\.0$/, '')} كم`;
}

export function formatDetour(sec: number): string {
  if (sec < 45) return '+أقل من دقيقة';
  return `+${Math.round(sec / 60)} د`;
}

export function formatMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return 'أقل من دقيقة';
  if (m === 1) return 'دقيقة';
  if (m === 2) return 'دقيقتين';
  if (m <= 10) return `${m} دقائق`;
  return `${m} دقيقة`;
}

export function itemsText(rs: Reminder[], max = 3): string {
  const titles = rs.map((r) => r.title || 'تذكير');
  if (titles.length <= max) return titles.join('، ');
  return `${titles.slice(0, max).join('، ')} و${titles.length - max} غيرها`;
}

export function targetLabel(t: Target | null): string {
  if (!t) return 'بدون مكان';
  switch (t.kind) {
    case 'category':
      if (t.categories.length === 1) return CATEGORY_BY_ID[t.categories[0]].anyLabel;
      return `أي ${t.categories.map((c) => CATEGORY_BY_ID[c].label).join(' أو ')}`;
    case 'brand': return t.brandId.startsWith('name:') ? t.label : `أي فرع ${BRAND_BY_ID[t.brandId]?.label ?? t.label}`;
    case 'place': return t.place.name;
  }
}

/** اسم المكان للعرض، مع نوعه قبله لو الاسم ما يدل عليه: «سوبرماركت · الرماية» */
export function placeTitle(place: Place, sep = ' · '): string {
  const kind = placeKind(place);
  if (!place.name) return kind?.label ?? 'مكان';
  return !kind || kind.named ? place.name : `${kind.label}${sep}${place.name}`;
}

export function reasonText(reason: SuppressReason, d: { detourSeconds?: number; angle?: number; settings: Settings; notBefore?: number }): string {
  const s = d.settings;
  switch (reason) {
    case 'detour': return `التحويلة ${formatDetour(d.detourSeconds ?? 0).slice(1)} أكبر من حدك (${s.maxDetourMin} د)`;
    case 'behind': return `المكان مو قدامك (زاوية ${Math.round(d.angle ?? 0)}° والحد ${s.aheadAngleDeg}°)`;
    case 'late': return 'قريب مرّة، ما فيه وقت كافي تتصرف بأمان';
    case 'notified': return 'سبق ونبهناك عنه في هالمشوار';
    case 'snoozed': return 'أجّلته لين ينتهي هالمشوار';
    case 'budget': return `وصلنا الحد الأقصى (${s.maxAlertsPerTrip} تنبيهات) في هالمشوار`;
    case 'cooldown': return 'بعد تنبيه قريب، نعطيك وقت قبل اللي بعده';
    case 'quiet': return `ساعات الهدوء (${s.quietStart}–${s.quietEnd})`;
    case 'notBefore': return `التذكير يبدأ ${d.notBefore ? new Date(d.notBefore).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'short' }) : 'لاحقًا'}`;
  }
}

export function whyAlertText(d: { angle: number; detourSeconds: number; approximate: boolean; settings: Settings; alertNo: number }): string {
  const s = d.settings;
  const detour = d.detourSeconds < 45 ? 'أقل من دقيقة' : formatMinutes(d.detourSeconds);
  return [
    `قدامك على طريقك (زاوية ${Math.round(d.angle)}°)`,
    `التحويلة ${detour}${d.approximate ? ' (تقديري)' : ''}، وحدك ${s.maxDetourMin} د`,
    `التنبيه ${d.alertNo} من ${s.maxAlertsPerTrip} في هالمشوار`,
  ].join(' · ');
}

/** نص مختصر للنطق أثناء القيادة */
export function spokenAlert(place: Place, distance: number, detourSeconds: number, rs: Reminder[]): string {
  const dist = distance < 1000 ? `${Math.round(distance / 50) * 50} متر` : `${(distance / 1000).toFixed(1)} كيلو`;
  const detour = detourSeconds < 45 ? 'تحويلة بسيطة' : `تحويلة ${formatMinutes(detourSeconds)}`;
  return `${placeTitle(place, ' ')} بعد ${dist}، ${detour}. عندك: ${itemsText(rs, 2)}`;
}
