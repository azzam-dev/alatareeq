/**
 * تقدير التحويلة على المستوى L0 (بدون وجهة).
 *
 * الخطة تعرّف التحويلة كـ ETA(me→place→dest) − ETA(me→dest)، وهذا يحتاج وجهة (V1).
 * بدونها نستخدم مسار سيارة واحد (me→place) ونقارنه بالمسافة اللي بتقطعها أصلًا لو كملت
 * على نفس الخط (along). الزيادة = ذهاب إضافي. والرجوع لطريقك:
 *   - لو الطريق للمكان مباشر: تقريبًا نفس البعد الجانبي.
 *   - لو الطريق ملتف (U-turn للجهة الثانية): الرجوع ملتف بنفس القدر.
 */

/** سرعة الشوارع الجانبية والتحويلات: ٣٠ كم/س */
export const SIDE_SPEED_MS = 30 / 3.6;

export interface DetourInput {
  routeDistanceM: number;
  alongM: number;
  crossM: number;
}

export interface DetourResult {
  seconds: number;
  /** الطريق للمكان ملتف (غالبًا في الجهة الثانية) */
  uturn: boolean;
  approximate: boolean;
}

export function estimateDetour({ routeDistanceM, alongM, crossM }: DetourInput): DetourResult {
  const extra = Math.max(0, routeDistanceM - Math.max(0, alongM));
  const outS = extra / SIDE_SPEED_MS;
  const uturn = extra > 2 * crossM + 300;
  const backS = uturn ? outS : Math.min(crossM, 2000) / SIDE_SPEED_MS;
  return { seconds: Math.round(outS + backS), uturn, approximate: false };
}

/** احتياط لو ما قدرنا نجيب مسار (بدون شبكة): تقدير هندسي متحفظ */
export function estimateDetourFallback(crossM: number): DetourResult {
  return { seconds: Math.round((2 * crossM * 1.4) / SIDE_SPEED_MS + 30), uturn: false, approximate: true };
}
