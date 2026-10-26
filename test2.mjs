import worker, { UserQuota } from './src/worker.js';
// in-memory Durable Object mock
const objs = new Map();
const QUOTA = { idFromName: (n) => n, get: (id) => {
  if (!objs.has(id)) { const m = new Map(); objs.set(id, new UserQuota({ storage: { get: async k => structuredClone(m.get(k)), put: async (k, v) => m.set(k, structuredClone(v)) } })); }
  const o = objs.get(id); return { fetch: (u) => o.fetch(new Request(u)) };
} };
const calls = []; globalThis.fetch = async (u, o) => { calls.push([u.split('/').pop(), JSON.parse(o.body)]); return Response.json({ ok: true, result: {} }); };
const env = { BOT_TOKEN: 'T', WEBHOOK_SECRET: 'S', DAILY_LIMIT: '3', MESSAGE_LIMIT: '6', ADMIN_IDS: '999', QUOTA };
const send = async (u) => { const w = []; await worker.fetch(new Request('https://b.dev/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'S' }, body: JSON.stringify(u) }), env, { waitUntil: p => w.push(p) }); await Promise.all(w); };
const msg = (uid, text) => send({ message: { message_id: 1, chat: { id: uid }, from: { id: uid }, text } });
const show = (label) => { const out = calls.splice(0).filter(c => c[0] !== 'sendChatAction').map(([m, b]) => m + ': ' + (b.caption || b.text || '').replace(/\n/g, ' / ').slice(0, 90)); console.log(label.padEnd(22), out.join(' || ') || '(no reply)'); };
for (const t of ['panadol', 'lasix', 'insulin', 'concor', 'brufen', '/limit', 'flagyl', 'xx']) { await msg(1, t); show('user1 ' + t); }
await send({ callback_query: { id: 'c', data: 'd:5', from: { id: 2 }, message: { chat: { id: 2 } } } }); show('user2 button');
for (let k = 0; k < 4; k++) { await msg(999, 'panadol'); } show('admin x4');
await msg(999, '/limit'); show('admin /limit');
