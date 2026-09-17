import { describe, expect, it } from 'vitest';
import {
  deadlineAlertAt, deadlineAlerts, effectiveRemind, isAllDay, newDeadline, remindTime, shiftDay, shiftTime,
} from './deadline';
import type { Reminder } from './types';

// الخميس ١٧ سبتمبر ٢٠٢٦، الساعة ١٠ صباحًا
const NOW = new Date(2026, 8, 17, 10, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).getTime();
const endOf = (day: number) => new Date(2026, 8, day, 23, 59, 59, 999).getTime();

const rem = (id: string, patch: Partial<Reminder> = {}): Reminder => ({
  id, title: id, trigger: 'pass', status: 'active', createdAt: NOW, target: null, ...patch,
});

describe('تنبيه قبل الموعد', () => {
  it('بساعة لو فيه ساعة، و٩ الصبح لو يوم بس', () => {
    expect(deadlineAlertAt(at(17, 19), NOW)).toBe(at(17, 18));
    expect(deadlineAlertAt(endOf(22), NOW)).toBe(at(22, 9));
  });
  it('ما يجي لو وقته فات', () => {
    // «قبل الساعة ١٠:٣٠» والساعة ١٠: أقرب من ساعة
    expect(deadlineAlertAt(at(17, 10, 30), NOW)).toBeNull();
    // «اليوم» والساعة ١٠: ٩ الصبح فاتت
    expect(deadlineAlertAt(endOf(17), NOW)).toBeNull();
    // فات الموعد نفسه
    expect(deadlineAlertAt(at(17, 8), NOW)).toBeNull();
  });
  it('يوم بس أو ساعة', () => {
    expect(isAllDay(endOf(18))).toBe(true);
    expect(isAllDay(at(18, 17))).toBe(false);
  });
});

describe('تجميع التنبيهات', () => {
  it('نفس الوقت إشعار واحد، والأقرب أول، والباقي يتجاهل', () => {
    const alerts = deadlineAlerts([
      rem('هدية', { deadline: endOf(22) }),
      rem('خبز', { deadline: at(17, 19) }),
      rem('حليب', { deadline: at(17, 19) }),
      rem('بنادول'),
      rem('عيش', { deadline: endOf(17) }),
      rem('جبن', { deadline: at(17, 19), status: 'done', doneAt: NOW }),
    ], NOW);
    expect(alerts.map((a) => [a.at, a.allDay, a.reminders.map((r) => r.title)])).toEqual([
      [at(17, 18), false, ['خبز', 'حليب']],
      [at(22, 9), true, ['هدية']],
    ]);
  });
  it('موعد بيوم وموعد بساعة ينبّهون بنفس الوقت: إشعارين', () => {
    const alerts = deadlineAlerts([rem('هدية', { deadline: endOf(22) }), rem('ورد', { deadline: at(22, 10) })], NOW);
    expect(alerts.map((a) => [a.at, a.allDay, a.reminders.map((r) => r.title)])).toEqual([
      [at(22, 9), true, ['هدية']],
      [at(22, 9), false, ['ورد']],
    ]);
  });
});

describe('«ذكرني» قبل الموعد', () => {
  it('بساعة: قبل ساعة أو ٣ ساعات أو يوم، أو لا', () => {
    expect(remindTime(at(20, 22), 'hours3')).toBe(at(20, 19));
    expect(remindTime(at(20, 22), 'day')).toBe(at(19, 22));
    expect(remindTime(at(20, 22), 'none')).toBeNull();
  });
  it('طول اليوم: ٩ الصبح أو ٩ الليلة اللي قبل', () => {
    expect(remindTime(endOf(20), 'eve')).toBe(at(19, 21));
    expect(remindTime(endOf(20))).toBe(at(20, 9));
  });
  it('الخيار اللي ما يناسب نوع الموعد يرجع للافتراضي', () => {
    expect(effectiveRemind(endOf(20), 'hours3')).toBe('morning');
    expect(effectiveRemind(at(20, 22), 'eve')).toBe('hour');
    expect(effectiveRemind(at(20, 22), 'none')).toBe('none');
  });
  it('اللي فات وقته ما له إشعار', () => {
    // الساعة ١٠، والموعد ١٢ الظهر: قبل ٣ ساعات = ٩ الصبح فات
    expect(deadlineAlertAt(at(17, 12), NOW, 'hours3')).toBeNull();
    expect(deadlineAlertAt(at(17, 12), NOW, 'hour')).toBe(at(17, 11));
  });
  it('نفس الموعد و«ذكرني» مختلف: إشعارين', () => {
    const alerts = deadlineAlerts([
      rem('خبز', { deadline: at(20, 22) }),
      rem('حليب', { deadline: at(20, 22), remindBefore: 'hour' }),
      rem('عيش', { deadline: at(20, 22), remindBefore: 'day' }),
      rem('جبن', { deadline: at(20, 22), remindBefore: 'none' }),
    ], NOW);
    expect(alerts.map((a) => [a.at, a.remind, a.reminders.map((r) => r.title)])).toEqual([
      [at(19, 22), 'day', ['عيش']],
      [at(20, 21), 'hour', ['خبز', 'حليب']],
    ]);
  });
});

describe('تعديل الموعد في المحرر', () => {
  it('أول ما يفتح: اليوم طول اليوم', () => {
    expect(newDeadline(NOW)).toBe(endOf(17));
  });
  it('اليوم قدام وورا، وما يرجع قبل اليوم', () => {
    expect(shiftDay(at(18, 22), 1, NOW)).toBe(at(19, 22));
    expect(shiftDay(endOf(18), -1, NOW)).toBe(endOf(17));
    expect(shiftDay(endOf(17), -1, NOW)).toBe(endOf(17));
  });
  it('الوقت: من «طول اليوم» يبدأ بساعة معقولة', () => {
    // الحين ١٠:٠٠ ← ١٢:٠٠، والحين ١٠:٢٠ ← ١:٠٠ م، ويوم ثاني ← ٥ م، و+ أو − نفس الشي
    expect(shiftTime(endOf(17), 1, NOW)).toBe(at(17, 12));
    expect(shiftTime(endOf(17), -1, at(17, 10, 20))).toBe(at(17, 13));
    expect(shiftTime(endOf(19), 1, NOW)).toBe(at(19, 17));
  });
  it('الوقت: كل ضغطة نص ساعة، والربع ينقرّب', () => {
    expect(shiftTime(at(18, 10), 1, NOW)).toBe(at(18, 10, 30));
    expect(shiftTime(at(18, 10, 30), 1, NOW)).toBe(at(18, 11));
    expect(shiftTime(at(18, 10), -1, NOW)).toBe(at(18, 9, 30));
    expect(shiftTime(at(18, 10, 15), 1, NOW)).toBe(at(18, 10, 30));
    expect(shiftTime(at(18, 10, 15), -1, NOW)).toBe(at(18, 10));
  });
  it('الوقت: بعد 11:30 م أو قبل 12:00 ص يرجع «طول اليوم» بنفس اليوم', () => {
    expect(shiftTime(at(18, 23, 30), 1, NOW)).toBe(endOf(18));
    expect(shiftTime(at(18, 0), -1, NOW)).toBe(endOf(18));
    expect(shiftTime(at(18, 23), 1, NOW)).toBe(at(18, 23, 30));
  });
});
