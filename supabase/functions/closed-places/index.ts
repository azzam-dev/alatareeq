// «المحل مقفل نهائيًا»: TomTom ما يعلّم على المحلات اللي سكّرت، فالمستخدمين يبلّغون.
// report: تبليغ (جوال واحد = تبليغ واحد لكل محل)، undo: يرجع عن تبليغه، list: المحلات المقفلة عند الكل.
// المحل ينشال عند الكل بعد تبليغات من ٣ شبكات مختلفة (قرار صاحب المشروع)، عشان شخص واحد ما يشيل محل شغال بأكثر من جهاز.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const REPORTS_TO_CLOSE = 3;

interface Body {
  action?: 'report' | 'undo' | 'list';
  placeId?: string;
  name?: string;
  device?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** بصمة الشبكة بدل عنوانها: نعرف إن التبليغين من شبكة وحدة بدون ما نحفظ العنوان */
async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`alatareeq:${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** المحلات اللي بلّغ عنها ٣ شبكات مختلفة أو أكثر */
async function closedIds(): Promise<string[]> {
  const { data } = await db.from('closed_reports').select('place_id, ip_hash');
  const nets = new Map<string, Set<string>>();
  for (const r of data ?? []) {
    if (!nets.has(r.place_id)) nets.set(r.place_id, new Set());
    nets.get(r.place_id)!.add(r.ip_hash);
  }
  return [...nets].filter(([, s]) => s.size >= REPORTS_TO_CLOSE).map(([id]) => id);
}

const ID_RE = /^[\w:.-]{1,80}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  if (body.action === 'list') return json({ closed: await closedIds() });

  const placeId = body.placeId ?? '';
  const device = body.device ?? '';
  if (!ID_RE.test(placeId) || !ID_RE.test(device)) return json({ error: 'bad id' }, 400);

  if (body.action === 'undo') {
    await db.from('closed_reports').delete().eq('place_id', placeId).eq('device', device);
    return json({ ok: true });
  }
  if (body.action === 'report') {
    const { error } = await db.from('closed_reports').upsert({
      place_id: placeId, device, ip_hash: await ipHash(req), name: (body.name ?? '').slice(0, 120) || null,
    });
    if (error) return json({ error: 'save failed' }, 500);
    return json({ ok: true, closed: (await closedIds()).includes(placeId) });
  }
  return json({ error: 'bad action' }, 400);
});
