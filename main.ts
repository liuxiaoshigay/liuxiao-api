/**
 * 刘骁是gay · 投稿 / 句子 API
 * Deno Deploy + Deno KV
 *
 * 环境变量：
 *   ADMIN_KEY  管理键（必填，长随机串；不设置则管理接口全部 401）
 *
 * 公开接口：
 *   GET  /quotes           已上线的动态句子
 *   POST /submit           投稿 { speaker?, text }
 *
 * 管理接口（请求头 X-Admin-Key）：
 *   GET  /pending          待审核投稿
 *   POST /approve          { id } 通过
 *   POST /delete-pending   { id } 忽略
 *   POST /add              { speaker?, text } 手动添加
 *   POST /delete-quote     { id } 删除已上线
 */

const kv = await Deno.openKv();
const ADMIN_KEY = Deno.env.get("ADMIN_KEY") ?? "";

const MAX_TEXT = 120;
const MAX_SPEAKER = 20;
const MAX_PENDING = 200;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

function isAdmin(req: Request): boolean {
  if (!ADMIN_KEY) return false;
  return (req.headers.get("x-admin-key") ?? "") === ADMIN_KEY;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function listAll(prefix: string[]): Promise<any[]> {
  const items: any[] = [];
  for await (const entry of kv.list({ prefix })) items.push(entry.value);
  return items;
}

function byCreated(a: any, b: any): number {
  return Number(a?.created_at ?? 0) - Number(b?.created_at ?? 0);
}

async function pendingCount(): Promise<number> {
  let n = 0;
  for await (const _ of kv.list({ prefix: ["pending"] }, { limit: MAX_PENDING + 1 })) {
    n++;
  }
  return n;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ---------- 公开：已上线 ----------
  if (req.method === "GET" && url.pathname === "/quotes") {
    const quotes = await listAll(["quotes"]);
    quotes.sort(byCreated);
    return json(quotes);
  }

  // ---------- 公开：投稿 ----------
  if (req.method === "POST" && url.pathname === "/submit") {
    if (await pendingCount() >= MAX_PENDING) {
      return json({ error: "too many pending, try later" }, 429);
    }

    const data = await readJson(req);
    if (!data) return json({ error: "bad json" }, 400);

    const text = clean(data.text, MAX_TEXT);
    const speaker = clean(data.speaker, MAX_SPEAKER);
    if (!text) return json({ error: "text required" }, 400);

    const item = {
      id: crypto.randomUUID(),
      speaker,
      text,
      created_at: Date.now(),
    };

    await kv.set(["pending", item.id], item);
    return json({ ok: true, id: item.id }, 201);
  }

  // ---------- 管理：待审核 ----------
  if (req.method === "GET" && url.pathname === "/pending") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
    const items = await listAll(["pending"]);
    items.sort(byCreated);
    return json(items);
  }

  // ---------- 管理：通过 ----------
  if (req.method === "POST" && url.pathname === "/approve") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

    const data = await readJson(req);
    const id = clean(data?.id, 80);
    if (!id) return json({ error: "id required" }, 400);

    const entry = await kv.get(["pending", id]);
    if (!entry.value) return json({ error: "not found" }, 404);

    await kv.set(["quotes", id], entry.value);
    await kv.delete(["pending", id]);
    return json({ ok: true, id });
  }

  // ---------- 管理：忽略 ----------
  if (req.method === "POST" && url.pathname === "/delete-pending") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

    const data = await readJson(req);
    const id = clean(data?.id, 80);
    if (!id) return json({ error: "id required" }, 400);

    await kv.delete(["pending", id]);
    return json({ ok: true });
  }

  // ---------- 管理：手动添加 ----------
  if (req.method === "POST" && url.pathname === "/add") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

    const data = await readJson(req);
    if (!data) return json({ error: "bad json" }, 400);

    const text = clean(data.text, MAX_TEXT);
    const speaker = clean(data.speaker, MAX_SPEAKER);
    if (!text) return json({ error: "text required" }, 400);

    const item = {
      id: crypto.randomUUID(),
      speaker,
      text,
      created_at: Date.now(),
    };

    await kv.set(["quotes", item.id], item);
    return json(item, 201);
  }

  // ---------- 管理：删除已上线 ----------
  if (req.method === "POST" && url.pathname === "/delete-quote") {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

    const data = await readJson(req);
    const id = clean(data?.id, 80);
    if (!id) return json({ error: "id required" }, 400);

    await kv.delete(["quotes", id]);
    return json({ ok: true });
  }

  if (url.pathname === "/health") return json({ ok: true });

  return json({ error: "not found" }, 404);
});
