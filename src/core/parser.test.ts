import { describe, expect, it } from 'vitest';
import { parseReminder } from './parser';

// السبت ١٢ سبتمبر ٢٠٢٦، الساعة ١٠ صباحًا
const NOW = new Date(2026, 8, 12, 10, 0);
const p = (s: string) => parseReminder(s, NOW);
const at = (d?: number) => (d ? new Date(d) : null);

describe('parseReminder', () => {
  it('مثال الخطة: براند + مرور', () => {
    const r = p('ذكرني إذا مريت على جرير أشتري كتاب Java');
    expect(r.trigger).toBe('pass');
    expect(r.target).toEqual({ kind: 'brand', brandId: 'jarir', label: 'جرير' });
    expect(r.title).toBe('أشتري كتاب Java');
  });

  it('وصول لفئة', () => {
    const r = p('ذكرني لما أوصل الصيدلية آخذ الدواء');
    expect(r.trigger).toBe('arrive');
    expect(r.target).toEqual({ kind: 'category', categories: ['pharmacy'] });
    expect(r.title).toBe('آخذ الدواء');
  });

  it('استنتاج الفئة من الغرض', () => {
    const r = p('ذكرني أشتري شامبو');
    expect(r.trigger).toBe('pass');
    expect(r.inferred).toBe(true);
    expect(r.target).toEqual({ kind: 'category', categories: ['pharmacy', 'grocery'] });
    expect(r.title).toBe('أشتري شامبو');
  });

  it('وقت: بكرة الساعة ٥ العصر', () => {
    const r = p('ذكرني بكرة الساعة 5 العصر أتصل على أمي');
    expect(r.trigger).toBe('time');
    expect(at(r.at)).toEqual(new Date(2026, 8, 13, 17, 0));
    expect(r.title).toBe('أتصل على أمي');
  });

  it('«بأي صيدلية» + حرف جر ملتصق في العنوان', () => {
    const r = p('إذا مريت بأي صيدلية ذكرني بالدواء');
    expect(r.trigger).toBe('pass');
    expect(r.target).toEqual({ kind: 'category', categories: ['pharmacy'] });
    expect(r.title).toBe('الدواء');
  });

  it('محطة بنزين (عبارة من كلمتين)', () => {
    const r = p('لو مريت على محطة بنزين عبّ السيارة');
    expect(r.target).toEqual({ kind: 'category', categories: ['fuel'] });
    expect(r.title).toBe('عبّ السيارة');
  });

  it('بعد ساعة', () => {
    const r = p('ذكرني بعد ساعة أطفي الفرن');
    expect(r.trigger).toBe('time');
    expect(at(r.at)).toEqual(new Date(2026, 8, 12, 11, 0));
    expect(r.title).toBe('أطفي الفرن');
  });

  it('مكان باسمه: مكتبة الجامعة', () => {
    const r = p('ذكرني إذا مريت على مكتبة الجامعة أرجع الكتاب');
    expect(r.target).toEqual({ kind: 'brand', brandId: 'name:مكتبة الجامعة', label: 'مكتبة الجامعة' });
    expect(r.title).toBe('أرجع الكتاب');
  });

  it('بقالة مع أكثر من غرض', () => {
    const r = p('ذكرني إذا عديت على بقالة أشتري حليب وخبز');
    expect(r.target).toEqual({ kind: 'category', categories: ['grocery'] });
    expect(r.title).toBe('أشتري حليب وخبز');
  });

  it('موعد نهائي: قبل الخميس', () => {
    const r = p('ذكرني قبل الخميس إذا مريت على النهدي أشتري فيتامين د');
    expect(r.target).toMatchObject({ kind: 'brand', brandId: 'nahdi' });
    expect(at(r.deadline)).toEqual(new Date(2026, 8, 17, 0, 0));
    expect(r.title).toBe('أشتري فيتامين د');
  });

  it('أرقام عربية ومساءً', () => {
    const r = p('ذكرني الساعة ٥:٣٠ م بالاجتماع');
    expect(r.trigger).toBe('time');
    expect(at(r.at)).toEqual(new Date(2026, 8, 12, 17, 30));
    expect(r.title).toBe('الاجتماع');
  });

  it('الليلة', () => {
    const r = p('ذكرني الليلة أرسل الملف');
    expect(at(r.at)).toEqual(new Date(2026, 8, 12, 21, 0));
    expect(r.title).toBe('أرسل الملف');
  });

  it('بدون عنوان', () => {
    const r = p('ذكرني بعد 10 دقايق');
    expect(at(r.at)).toEqual(new Date(2026, 8, 12, 10, 10));
    expect(r.title).toBe('تذكير');
  });

  it('مكان + بكرة = يبدأ من بكرة', () => {
    const r = p('ذكرني بكرة إذا مريت على بقالة أشتري حليب');
    expect(r.trigger).toBe('pass');
    expect(at(r.notBefore)).toEqual(new Date(2026, 8, 13, 0, 0));
  });

  it('اسم حر غير معروف', () => {
    const r = p('إذا مريت على كافيه دوز أشتري قهوة');
    expect(r.target).toEqual({ kind: 'brand', brandId: 'name:كافيه دوز', label: 'كافيه دوز' });
    expect(r.title).toBe('أشتري قهوة');
  });

  it('عند وصولي', () => {
    const r = p('عند وصولي للمغسلة أستلم الثياب');
    expect(r.trigger).toBe('arrive');
    expect(r.target).toEqual({ kind: 'category', categories: ['laundry'] });
    expect(r.title).toBe('أستلم الثياب');
  });

  it('ما فيه مكان ولا وقت', () => {
    const r = p('ذكرني أكلم أبوي');
    expect(r.needsTarget).toBe(true);
    expect(r.title).toBe('أكلم أبوي');
  });

  it('الصراف فئة إضافية', () => {
    const r = p('ذكرني أسحب فلوس من الصراف');
    expect(r.target).toEqual({ kind: 'category', categories: ['atm'] });
    expect(r.title).toBe('أسحب فلوس');
  });

  it('وقت بدون فترة: أقرب وقت قادم', () => {
    const r = p('ذكرني الساعة 8 أشغل الغسالة');
    expect(at(r.at)).toEqual(new Date(2026, 8, 12, 20, 0));
  });

  it('في طريقي', () => {
    const r = p('في طريقي للدوام ذكرني أعبي بنزين');
    expect(r.trigger).toBe('pass');
  });
});
