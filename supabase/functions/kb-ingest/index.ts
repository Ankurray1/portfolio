// Ask Ankur · knowledge-base ingest.
// POST {"mode":"sync"}  → load kb/chunks.json from the public repo, upsert changed chunks, drop removed ones.
// POST {"mode":"embed"} → embed up to BATCH chunks that have no embedding yet; call again until remaining = 0.
// It only ever reads the public knowledge base, so a stray call can do no harm beyond re-checking it.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const KB_URL = 'https://raw.githubusercontent.com/Ankurray1/portfolio/main/kb/chunks.json';
const BATCH = 6; // keeps each call well inside the edge function CPU budget
const model = new Supabase.ai.Session('gte-small');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Chunk = { id: string; kind: string; title: string; section: string; url: string; content: string };

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

async function sync() {
  const res = await fetch(KB_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('knowledge base fetch failed: ' + res.status);
  const { chunks } = (await res.json()) as { chunks: Chunk[] };
  const { data: existing, error } = await db.from('kb_chunks').select('id, content_hash');
  if (error) throw error;
  const known = new Map((existing ?? []).map((r) => [r.id, r.content_hash]));
  const rows = [];
  for (const c of chunks) {
    const content_hash = await sha256(c.content);
    if (known.get(c.id) === content_hash) continue;
    // a changed chunk loses its embedding so the embed step picks it up again
    rows.push({ id: c.id, kind: c.kind, title: c.title, section: c.section ?? '', url: c.url, content: c.content, content_hash, embedding: null, updated_at: new Date().toISOString() });
  }
  for (let i = 0; i < rows.length; i += 100) {
    const { error: e } = await db.from('kb_chunks').upsert(rows.slice(i, i + 100));
    if (e) throw e;
  }
  const keep = new Set(chunks.map((c) => c.id));
  const stale = [...known.keys()].filter((id) => !keep.has(id));
  if (stale.length) {
    const { error: e } = await db.from('kb_chunks').delete().in('id', stale);
    if (e) throw e;
  }
  return { total: chunks.length, changed: rows.length, removed: stale.length };
}

async function embed() {
  const { data, error } = await db.from('kb_chunks').select('id, content').is('embedding', null).limit(BATCH);
  if (error) throw error;
  for (const r of data ?? []) {
    const vec = await model.run(r.content, { mean_pool: true, normalize: true });
    const { error: e } = await db.from('kb_chunks').update({ embedding: JSON.stringify(vec) }).eq('id', r.id);
    if (e) throw e;
  }
  const { count } = await db.from('kb_chunks').select('id', { count: 'exact', head: true }).is('embedding', null);
  return { embedded: data?.length ?? 0, remaining: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  try {
    const { mode } = await req.json().catch(() => ({ mode: '' }));
    const out = mode === 'sync' ? await sync() : mode === 'embed' ? await embed() : null;
    if (!out) return Response.json({ error: 'mode must be "sync" or "embed"' }, { status: 400 });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
