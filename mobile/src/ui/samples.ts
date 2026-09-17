import { targetLabel } from '../../../src/core/compose';
import { parseReminder } from '../../../src/core/parser';
import { toReminderInputs } from '../../../src/core/reminderInput';
import { store, uid } from '../state/store';

export const EXAMPLES = [
  'ابي اشتري بنادول وشامبو',
  'ذكرني أشتري خبز وحليب بكرة',
  'ذكرني إذا مريت على جرير أشتري دفتر',
  'لو مريت على محطة بنزين أعبي السيارة',
];

/** نضيف الأمثلة عن طريق المحلل نفسه، عشان تشوف كيف يفهم الجمل */
export function addSamples() {
  const now = Date.now();
  EXAMPLES.forEach((raw, i) => {
    for (const input of toReminderInputs(parseReminder(raw), raw)) {
      if (input.needsPlace) continue;
      store.addReminder({
        id: uid(), title: input.title || targetLabel(input.target), trigger: 'pass', target: input.target, deadline: input.deadline,
        priority: input.priority, status: 'active', createdAt: now - i, raw,
      });
    }
  });
}
