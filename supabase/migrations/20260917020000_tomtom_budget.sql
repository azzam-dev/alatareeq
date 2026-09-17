-- رصيد TomTom للأماكن بالشهر لكل نوع محل (src/core/placeTiles.ts → affordable)
-- demand: كم مرة طلبت التطبيقات هالنوع هالشهر (عدد بس، بدون أي معلومة عن الشخص)
-- spent: كم صرف من طلبات TomTom (كسور، لأن السؤال الواحد عن كذا نوع ينقسم عليهم)
-- ما فيه سياسات: دالة nearby-places بس تقرأ وتكتب
create table public.tomtom_budget (
  -- «2026-09»
  month text not null,
  -- فئة التطبيق (CategoryId)
  category text not null,
  demand integer not null default 0,
  spent numeric not null default 0,
  primary key (month, category)
);

alter table public.tomtom_budget enable row level security;
