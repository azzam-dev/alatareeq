-- تبليغات «المحل مقفل نهائيًا». المحل ينشال عند الكل لما يبلّغ عنه ٣ من شبكات مختلفة (دالة closed-places).
-- بدون سياسات: القراءة والكتابة من الدالة بس (مفتاح السيرفر).
create table public.closed_reports (
  place_id text not null check (char_length(place_id) <= 80),
  device text not null check (char_length(device) <= 40),
  ip_hash text not null check (char_length(ip_hash) <= 64),
  name text check (char_length(name) <= 120),
  created_at timestamptz not null default now(),
  primary key (place_id, device)
);
alter table public.closed_reports enable row level security;
