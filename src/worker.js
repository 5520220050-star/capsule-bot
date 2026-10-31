// Memorize The Capsule — Telegram bot (Cloudflare Worker)
// Send a drug name (generic or trade, any case) → the bot replies with that drug's page as a PDF.
import { DRUGS, KEYS, FILE_VERSION } from './drugs.js';

const BOOK = 'Memorize The Capsule · Nursing Cards';
const KEY_LIST = Object.keys(KEYS);

// ---------- text helpers ----------
function norm(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Keys grouped by length so typo search only compares names of similar length
const BY_LEN = [];
for (const k of KEY_LIST) (BY_LEN[k.length] ||= []).push(k);
const ROW_A = new Int32Array(64), ROW_B = new Int32Array(64), ROW_C = new Int32Array(64);

// Damerau–Levenshtein (optimal string alignment) with early exit, no allocations
function dist(a, b, max) {
  let pp = ROW_A, p = ROW_B, c = ROW_C;
  for (let j = 0; j <= b.length; j++) p[j] = j;
  for (let i = 1; i <= a.length; i++) {
    c[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && pp[j - 2] + 1 < v) v = pp[j - 2] + 1;
      c[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = pp; pp = p; p = c; c = t;
  }
  return p[b.length];
}

// Returns { exact: [ids] } or { suggest: [ids] }
export function search(text) {
  const q = norm(text).slice(0, 60);
  if (q.length < 2) return { suggest: [] };
  if (KEYS[q]) return { exact: KEYS[q] };

  // query starts a name ("amlo"), or a name starts the query ("panadol extra", "amlodipine 5mg")
  const pref = [];
  const addAll = (arr, ids) => { for (const i of ids) if (!arr.includes(i)) arr.push(i); };
  if (q.length >= 3) {
    for (const k of KEY_LIST) {
      if (k.startsWith(q) || (k.length >= 4 && q.startsWith(k))) addAll(pref, KEYS[k]);
    }
  }
  if (pref.length === 1 && q.length >= 5) return { exact: pref };

  // spelling mistakes
  const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  const scored = [];
  for (let L = Math.max(2, q.length - max); L <= q.length + max; L++) {
    for (const k of BY_LEN[L] || []) {
      const dd = dist(q, k, max);
      if (dd <= max) scored.push([dd, k]);
    }
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].length - y[1].length);
  if (pref.length === 0 && scored.length && scored[0][0] <= 1) {
    const best = [];
    for (const [dd, k] of scored) if (dd === scored[0][0]) addAll(best, KEYS[k]);
    if (best.length === 1) return { exact: best };
  }
  const out = [...pref];
  for (const [, k] of scored) addAll(out, KEYS[k]);
  return { suggest: out.slice(0, 8) };
}

// ---------- Telegram ----------
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.log(method, JSON.stringify(j));
  return j;
}

const buttons = (ids) => ({ inline_keyboard: ids.map((i) => [{ text: DRUGS[i].n, callback_data: 'd:' + i }]) });

// ---------- per-user daily limits ----------
// A day runs midnight to midnight, Baghdad time (UTC+3).
const dayKey = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const drugLimit = (env) => parseInt(env.DAILY_LIMIT || '50', 10);
const msgLimit = (env) => parseInt(env.MESSAGE_LIMIT || '150', 10);
const isAdmin = (env, uid) => (env.ADMIN_IDS || '').split(/[,\s]+/).filter(Boolean).includes(String(uid));

// One call per Telegram update: counts the message, and (if wanted) one PDF.
async function useQuota(env, uid, wantsDrug) {
  if (isAdmin(env, uid)) return { blocked: false, drugOk: true, left: Infinity };
  const stub = env.QUOTA.get(env.QUOTA.idFromName(String(uid)));
  const q = new URLSearchParams({ day: dayKey(), drug: wantsDrug ? '1' : '0', dl: drugLimit(env), ml: msgLimit(env) });
  const r = await stub.fetch('https://quota/hit?' + q);
  return r.json();
}

// Durable Object: one tiny record per user { day, drugs, msgs }
export class UserQuota {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const u = new URL(req.url);
    const day = u.searchParams.get('day');
    const dl = +u.searchParams.get('dl'), ml = +u.searchParams.get('ml');
    let rec = (await this.state.storage.get('r')) || {};
    if (rec.day !== day) rec = { day, drugs: 0, msgs: 0 };
    const out = { blocked: false, notify: false, drugOk: false, left: Math.max(0, dl - rec.drugs) };
    if (u.pathname === '/peek') return Response.json(out);
    if (rec.msgs >= ml) {
      // over the message limit: tell the user once, then ignore silently
      out.blocked = true;
      out.notify = rec.msgs === ml;
      if (out.notify) { rec.msgs++; await this.state.storage.put('r', rec); }
      return Response.json(out);
    }
    rec.msgs++;
    if (u.searchParams.get('drug') === '1' && rec.drugs < dl) { rec.drugs++; out.drugOk = true; }
    out.left = Math.max(0, dl - rec.drugs);
    await this.state.storage.put('r', rec);
    return Response.json(out);
  }
}

async function peekQuota(env, uid) {
  if (isAdmin(env, uid)) return { left: Infinity };
  const stub = env.QUOTA.get(env.QUOTA.idFromName(String(uid)));
  return (await stub.fetch('https://quota/peek?' + new URLSearchParams({ day: dayKey(), dl: drugLimit(env), ml: msgLimit(env) }))).json();
}

const limitText = (env) =>
  `⛔️ You have reached today's limit of <b>${drugLimit(env)} drug pages</b>.\n` +
  'The limit resets at midnight (Baghdad time). Thank you for using the bot!';

async function sendDrug(env, origin, chat, i, replyTo, left) {
  const d = DRUGS[i];
  const leftTxt = left === Infinity || left == null ? '' : `\n${left} page${left === 1 ? '' : 's'} left today`;
  const caption = `<b>${esc(d.n)}</b>\n${esc(d.c)}\n<i>${esc(BOOK)} · page ${d.p}</i>${leftTxt}`;
  await tg(env, 'sendChatAction', { chat_id: chat, action: 'upload_document' });
  const r = await tg(env, 'sendDocument', {
    chat_id: chat,
    document: `${origin}/${d.u}?v=${FILE_VERSION}`,
    caption,
    parse_mode: 'HTML',
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
  if (!r.ok) await tg(env, 'sendMessage', { chat_id: chat, text: 'Sorry, the page could not be sent. Please try again in a moment.' });
}

const HELP = (env) =>
  `💊 <b>${esc(BOOK)}</b>\n\n` +
  'Send me a drug name and I will send you its page as a PDF.\n\n' +
  '• Generic or trade names both work: <code>paracetamol</code>, <code>Panadol</code>, <code>AUGMENTIN</code>\n' +
  '• Capital or small letters do not matter\n' +
  '• Small spelling mistakes are OK: <code>amoxicilin</code>\n\n' +
  `The book covers ${DRUGS.length} common drugs. Each user can get up to ${drugLimit(env)} pages per day.\n` +
  '/limit shows how many you have left today.';

async function onMessage(env, origin, msg) {
  const chat = msg.chat.id;
  const uid = (msg.from && msg.from.id) || chat;
  const text = (msg.text || '').trim();
  if (!text) return;

  if (/^\/myid\b/i.test(text)) return tg(env, 'sendMessage', { chat_id: chat, text: `Your Telegram ID: <code>${uid}</code>`, parse_mode: 'HTML' });
  if (/^\/limit\b/i.test(text)) {
    const p = await peekQuota(env, uid);
    const t = p.left === Infinity ? 'You have no daily limit (admin).' : `You have <b>${p.left}</b> of ${drugLimit(env)} pages left today.`;
    return tg(env, 'sendMessage', { chat_id: chat, text: t, parse_mode: 'HTML' });
  }

  const isHelp = /^\/(start|help)\b/i.test(text);
  const query = isHelp ? '' : text.replace(/^\/\w+(@\w+)?\s*/, '').slice(0, 60);
  if (!isHelp && !query) return;
  const res = isHelp ? null : search(query);
  const single = res && res.exact && res.exact.length === 1;

  const q = await useQuota(env, uid, single);
  if (q.blocked) {
    if (q.notify) await tg(env, 'sendMessage', { chat_id: chat, text: 'You are sending too many messages today. Please try again tomorrow.' });
    return;
  }
  if (isHelp) return tg(env, 'sendMessage', { chat_id: chat, text: HELP(env), parse_mode: 'HTML' });
  if (single) {
    if (!q.drugOk) return tg(env, 'sendMessage', { chat_id: chat, text: limitText(env), parse_mode: 'HTML' });
    return sendDrug(env, origin, chat, res.exact[0], msg.message_id, q.left);
  }
  if (res.exact) {
    return tg(env, 'sendMessage', {
      chat_id: chat,
      text: `“${esc(query)}” contains more than one drug in the book. Which page do you want?`,
      parse_mode: 'HTML',
      reply_markup: buttons(res.exact),
    });
  }
  if (res.suggest.length) {
    return tg(env, 'sendMessage', {
      chat_id: chat,
      text: `I couldn't find “${esc(query)}” exactly. Did you mean:`,
      parse_mode: 'HTML',
      reply_markup: buttons(res.suggest),
    });
  }
  return tg(env, 'sendMessage', {
    chat_id: chat,
    text: `Sorry, “${esc(query)}” is not in the book. Check the spelling, or try the generic name.`,
    parse_mode: 'HTML',
  });
}

async function onCallback(env, origin, cq) {
  const m = /^d:(\d+)$/.exec(cq.data || '');
  if (!m || !DRUGS[+m[1]] || !cq.message) return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  const q = await useQuota(env, cq.from.id, true);
  if (q.blocked) return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Too many requests today. Try again tomorrow.', show_alert: true });
  if (!q.drugOk) return tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: `Daily limit of ${drugLimit(env)} pages reached. It resets at midnight (Baghdad time).`, show_alert: true });
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  await sendDrug(env, origin, cq.message.chat.id, +m[1], null, q.left);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // Telegram webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      const update = await request.json().catch(() => null);
      if (update) {
        const work = update.message
          ? onMessage(env, origin, update.message)
          : update.callback_query
            ? onCallback(env, origin, update.callback_query)
            : null;
        if (work) ctx.waitUntil(work.catch((e) => console.log('error', e && e.stack)));
      }
      return new Response('ok');
    }

    // One-time setup: open https://<your-worker>/setup?key=<WEBHOOK_SECRET> in a browser
    if (url.pathname === '/setup') {
      if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('wrong key', { status: 403 });
      const a = await tg(env, 'setWebhook', {
        url: `${origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      });
      const b = await tg(env, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'How to use the bot' },
          { command: 'help', description: 'How to use the bot' },
          { command: 'limit', description: 'Pages left today' },
        ],
      });
      const c = await tg(env, 'setMyDescription', {
        description: `${BOOK}\nSend a drug name (generic or trade) and get its page as a PDF.`,
      });
      return new Response(
        JSON.stringify({ webhook: a, commands: b, description: c }, null, 2),
        { headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response('Memorize The Capsule bot is running.');
  },
};
