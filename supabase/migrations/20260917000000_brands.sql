-- البراندات المشتركة بين المستخدمين: الاسم الصحيح من TomTom وكل خطأ إملائي تأكد
-- التطبيق يقرأ بس، والكتابة من دالة verify-brand بمفتاح السيرفر
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  -- مثل ما يكتبه المحل: «النهدي»
  name text not null,
  -- للمطابقة (brandKey في src/core/brandName.ts): «نهدي»
  key text not null unique,
  -- فئة التطبيق (CategoryId) أو null
  category text,
  -- مفاتيح أخطاء إملائية أكدها مستخدم: «جريير»
  aliases text[] not null default '{}',
  -- كم فرع لقيناه في TomTom وقت الإضافة
  branches integer not null default 0,
  created_at timestamptz not null default now()
);

create index brands_aliases_idx on public.brands using gin (aliases);

alter table public.brands enable row level security;

create policy "البراندات للقراءة" on public.brands
  for select to anon, authenticated using (true);
