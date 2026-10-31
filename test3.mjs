import worker, { UserQuota } from './src/worker.js';
const objs = new Map();
const QUOTA = { idFromName: (n) => n, get: (id) => { if (!objs.has(id)) { const m = new Map(); objs.set(id, new UserQuota({ storage: { get: async k => structuredClone(m.get(k)), put: async (k, v) => m.set(k, structuredClone(v)) } })); } const o = objs.get(id); return { fetch: (u) => o.fetch(new Request(u)) }; } };
const calls = []; globalThis.fetch = async (u, o) => { calls.push([u.split('/').pop(), JSON.parse(o.body)]); return Response.json({ ok: true, result: {} }); };
const env = { BOT_TOKEN: 'T', WEBHOOK_SECRET: 'S', DAILY_LIMIT: '50', MESSAGE_LIMIT: '150', ADMIN_IDS: '', QUOTA };
const send = async (u) => { const w = []; await worker.fetch(new Request('https://b.dev/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'S' }, body: JSON.stringify(u) }), env, { waitUntil: p => w.push(p) }); await Promise.all(w); };
const cb = (data) => send({ callback_query: { id: 'c', data, from: { id: 7 }, message: { message_id: 3, chat: { id: 7 } } } });
const last = () => { const c = calls.splice(0).filter(x => x[0] !== 'answerCallbackQuery'); return c.map(([m, b]) => `${m}: ${(b.text || b.caption || '').split('\n')[0]} | buttons=${b.reply_markup ? b.reply_markup.inline_keyboard.flat().length : 0} | ${b.document || ''} ${b.reply_markup ? JSON.stringify(b.reply_markup.inline_keyboard.flat().slice(0,3).map(x=>x.text)) : ''}`).join('\n'); };
await send({ message: { message_id: 1, chat: { id: 7 }, from: { id: 7 }, text: '/list' } }); console.log(last());
await send({ message: { message_id: 1, chat: { id: 7 }, from: { id: 7 }, text: '/start' } }); console.log(last());
for (const d of ['L', 'p:0', 'c:0:1', 'A', 'a:C', 'p:3']) { await cb(d); console.log(d, '→', last()); }
await cb('d:0'); console.log('d:0 →', last());
let maxlen = 0; const {BROWSE, DRUGS} = await import('./src/drugs.js');
BROWSE.forEach((p,i)=>p[1].forEach((c,j)=>{maxlen=Math.max(maxlen,`c:${i}:${j}`.length, c[1].length)}));
console.log('max class size', maxlen);
