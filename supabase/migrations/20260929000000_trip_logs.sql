-- مؤقت للاختبار (٢٩ سبتمبر ٢٠٢٦، بموافقة صاحب المشروع): سجل المشاوير لصفحة mobile/public/trips.html بدون كلمة سر.
-- ينشال مع الصفحة و mobile/src/services/tripLog.ts بعد الاختبار (drop table + drop policy "test: page reads" من الجدولين).
create table public.trip_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device text not null check (char_length(device) <= 40),
  log jsonb not null check (pg_column_size(log) <= 1000000)
);
alter table public.trip_logs enable row level security;
create policy "test: app inserts" on public.trip_logs for insert to anon with check (true);
create policy "test: page reads" on public.trip_logs for select to anon using (true);
create policy "test: page reads" on public.place_tiles for select to anon using (true);
create policy "test: page reads" on public.tomtom_budget for select to anon using (true);
