-- أماكن TomTom محفوظة لكل مربع (~١٫٥ كم) ونوع، ٣٠ يوم للكل (src/core/placeTiles.ts)
-- ما فيه سياسات: التطبيق ما يقرأ ولا يكتب مباشرة، بس دالة nearby-places بمفتاح السيرفر
create table public.place_tiles (
  -- «1834:3113» (tileOf)
  tile text not null,
  -- فئة التطبيق (CategoryId)
  category text not null,
  fetched_at timestamptz not null default now(),
  -- [{id, name, lat, lon, branch, brandNames, category}]
  places jsonb not null default '[]',
  primary key (tile, category)
);

alter table public.place_tiles enable row level security;
