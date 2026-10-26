# Memorize The Capsule — Telegram bot

Send the bot a drug name (generic or trade, capital or small letters, small spelling mistakes are fine) and it replies with that drug's page from the book as a PDF.

It runs on **Cloudflare Workers (free plan)**: no server, no monthly bill.

---

## What you need (one time)

1. A computer with **Node.js** (download the "LTS" version from nodejs.org and install it).
2. A free **Cloudflare account**: dash.cloudflare.com/sign-up
3. A Telegram bot token:
   - In Telegram, open **@BotFather** → send `/newbot` → choose a name and a username ending in `bot`.
   - BotFather replies with a token like `123456789:AAH...`. Keep it secret.

## Install (about 10 minutes)

1. Unzip this folder, e.g. to `Desktop\capsule-bot`.
2. Open a terminal **inside the folder**:
   - Windows: open the folder, click the address bar, type `cmd`, press Enter.
3. Run these commands one by one:

```
npm install
npx wrangler login
```
A browser window opens. Log in to Cloudflare and click **Allow**.

```
npx wrangler deploy
```
This uploads the bot and the 400 PDF pages (about 85 MB, so it can take a few minutes).
At the end it prints your bot address, like:
`https://capsule-bot.YOUR-NAME.workers.dev`. **Copy it.**

4. Add the two secrets:

```
npx wrangler secret put BOT_TOKEN
```
Paste the token from BotFather, then press Enter.

```
npx wrangler secret put WEBHOOK_SECRET
```
Type any long random password you invent (letters and numbers only, e.g. `Kufa2026capsuleXy7q9`), then press Enter.

5. Connect the bot to Telegram. Open this in your browser (use your own address and password):

```
https://capsule-bot.YOUR-NAME.workers.dev/setup?key=YOUR_WEBHOOK_SECRET
```
You should see `"ok": true` three times. Done. Open your bot in Telegram and send `/start`.

## Using the bot

- `paracetamol`, `PANADOL`, `Augmentin`, `co-amoxiclav`, `amoxicilin` (typo) all work.
- If a name matches several drugs (e.g. `insulin`, or a combination trade name like `Symbicort`), the bot shows buttons to choose from.
- Commands: `/start`, `/help`.

## Updating the book later

If you change the book, ask Claude to regenerate the `public` folder and `src/drugs.js`, replace them here, and run `npx wrangler deploy` again. Secrets and the webhook stay as they are.

## Daily limit per user

Each Telegram user can get **50 drug pages per day**. Page 51 gets a polite "limit reached" message instead, and the count resets at midnight Baghdad time.
As extra spam protection, a user who sends more than 150 messages in one day is ignored until the next day.

To change the numbers, edit `wrangler.jsonc` and run `npx wrangler deploy` again:
- `DAILY_LIMIT`: pages per user per day (default 50)
- `MESSAGE_LIMIT`: messages per user per day before the bot stops answering (default 150)
- `ADMIN_IDS`: your own Telegram ID, so you have no limit. Send `/myid` to the bot to see it, e.g. `"ADMIN_IDS": "123456789"`

Users can send `/limit` to see how many pages they have left today.

The counter is stored by Cloudflare automatically (a "Durable Object" defined in the bot code, free plan). You don't need to set anything up for it.

## Free-plan limits (Cloudflare, checked Oct 2026)

- 100,000 bot requests per day. Each drug a user asks for uses about one request (button taps count too), so that's tens of thousands of lookups a day. The counter resets every day at 03:00 Baghdad time.
- Sending the PDF files themselves is free and unlimited.
- If you ever go over the limit, the bot simply stops answering until the daily reset. It does not charge you.

## Files

- `src/worker.js`: the bot (search, daily limits, Telegram replies)
- `src/drugs.js`: the drug list, trade names and synonyms (generated)
- `public/f/...`: the 400 single-page PDFs (the folder names are random, so the files can't be guessed from outside)
- `wrangler.jsonc`: Cloudflare settings
- `test.mjs`: offline test (`node test.mjs`)
