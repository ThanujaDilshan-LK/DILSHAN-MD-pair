# DILSHAN-MD — Pair Code / QR Session Generator

A tiny standalone web app (separate from the main bot) that lets anyone
link their WhatsApp number and get back a portable **Session ID** string
to paste into the DILSHAN-MD bot as a `SESSION_ID` environment variable.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000

## Deploy (Railway / Render)
1. Push this folder as its own GitHub repo (e.g. `DILSHAN-MD-Pair`).
2. Railway: New Project → Deploy from GitHub → select the repo. It
   auto-detects Node and runs `npm start`.
   Render: New → Web Service → connect repo → Build: `npm install`,
   Start: `npm start`.
3. No environment variables are required for the site itself.
4. Open the deployed URL — that's your own pair/QR page, replacing
   `knight-bot-paircode.onrender.com`.

## How it works
- **Pair Code tab**: user types their WhatsApp number → server opens a
  temporary Baileys connection → `requestPairingCode()` returns a code
  → user enters it in WhatsApp (Linked Devices → Link with phone number).
- **QR tab**: server opens a temporary Baileys connection and streams
  the QR image → user scans it in WhatsApp (Linked Devices → Link a Device).
- Once linked, the server reads the generated `creds.json`, base64-encodes
  it into a single string prefixed `DILSHAN-MD~...`, shows it to the user,
  then immediately deletes the temporary session folder from the server
  (nothing is kept server-side after the string is shown).

## Using the Session ID in the bot
The bot's `index.js` currently loads credentials from the local
`./session` folder via `useMultiFileAuthState`. To support pasting a
`SESSION_ID` string instead (so you don't need to keep re-pairing on
every redeploy — see the earlier note about Heroku's ephemeral disk),
add this near the top of `index.js`, before `useMultiFileAuthState` is
called:

```js
const fs = require('fs');
const path = require('path');

if (process.env.SESSION_ID && process.env.SESSION_ID.startsWith('DILSHAN-MD~')) {
    const raw = process.env.SESSION_ID.replace('DILSHAN-MD~', '');
    const creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    fs.mkdirSync('./session', { recursive: true });
    fs.writeFileSync(path.join('./session', 'creds.json'), JSON.stringify(creds, null, 2));
}
```

This writes `creds.json` into `./session` on every boot, so even on a
platform with an ephemeral filesystem (like Heroku), the bot re-creates
its session from the environment variable instead of forcing a fresh
pairing each time.

## Security notes
- A Session ID string is equivalent to a password for that WhatsApp
  account — anyone who has it can send/read messages as that account.
  Never post it publicly, and only paste it into your own bot's
  environment variables.
- The rate limiter (5 attempts / 10 min per IP) and the 5-minute
  session expiry are there to stop the page being abused to spam
  pairing-code requests at WhatsApp's servers. Keep both in place if
  you make this page public.
