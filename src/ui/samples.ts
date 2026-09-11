import { parseReminder } from '../core/parser';
import { store, uid } from '../state/store';

export const EXAMPLES = [
  'ذكرني إذا مريت على صيدلية أشتري دواء',
  'ذكرني أشتري شامبو',
  'ذكرني إذا مريت على جرير أشتري كتاب Java',
  'لو مريت على محطة بنزين أعبي السيارة',
  'ذكرني لما أوصل البقالة أشتري حليب',
];

/** نضيف الأمثلة عن طريق المحلل نفسه، عشان تشوف كيف يفهم الجمل */
export function addSamples() {
  const now = Date.now();
  EXAMPLES.forEach((raw, i) => {
    const p = parseReminder(raw);
    store.addReminder({
      id: uid(), title: p.title, trigger: p.trigger, target: p.target, at: p.at, notBefore: p.notBefore,
      deadline: p.deadline, status: 'active', createdAt: now - i, raw,
    });
  });
}
