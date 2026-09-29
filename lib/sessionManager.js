/**
 * DILSHAN-MD — shared session manager
 * Used by routes/pair.js and routes/qr.js so both flows share the same
 * in-memory session registry, rate limiter, and creds encoding logic.
 */

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions_tmp');
fs.ensureDirSync(SESSIONS_DIR);

// id -> { status, code, qr, sock, folder, createdAt, sessionString, error }
const sessions = new Map();

// Basic per-IP rate limit (max 5 link attempts per 10 minutes)
const rateLimit = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const entry = rateLimit.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
        entry.count = 0;
        entry.start = now;
    }
    entry.count += 1;
    rateLimit.set(ip, entry);
    return entry.count > 5;
}

function newId() {
    return crypto.randomBytes(8).toString('hex');
}

// Encode a linked session's creds folder into one portable string.
// Format: DILSHAN-MD~<base64 JSON>
async function encodeSession(folder) {
    const credsPath = path.join(folder, 'creds.json');
    const creds = await fs.readJson(credsPath);
    const payload = Buffer.from(JSON.stringify(creds)).toString('base64');
    return `DILSHAN-MD~${payload}`;
}

// Decode a Session ID string back into a creds.json object.
// (Reused by the bot's own startup code — see README.)
function decodeSession(sessionId) {
    const raw = sessionId.replace(/^DILSHAN-MD~/, '');
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
}

async function cleanupSession(id, { removeFolder = true } = {}) {
    const s = sessions.get(id);
    if (!s) return;
    try { s.sock?.end?.(); } catch {}
    try { s.sock?.ws?.close?.(); } catch {}
    if (removeFolder) {
        try { await fs.remove(s.folder); } catch {}
    }
    sessions.delete(id);
}

// Sweep stale/expired sessions every minute (max lifetime 5 min if never linked)
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions.entries()) {
        if (s.status !== 'connected' && now - s.createdAt > 5 * 60 * 1000) {
            cleanupSession(id);
        }
    }
}, 60 * 1000);

// Opens a temporary Baileys socket for a new link attempt.
// onQr(dataUrl) fires whenever a fresh QR is issued.
async function startSocket(id, folder) {
    const { state, saveCreds } = await useMultiFileAuthState(folder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['DILSHAN-MD', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    const QRCode = require('qrcode');
    sock.ev.on('connection.update', async (update) => {
        const s = sessions.get(id);
        if (!s) return;
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            s.qr = await QRCode.toDataURL(qr);
            if (s.status !== 'code') s.status = 'qr';
        }

        if (connection === 'open') {
            s.status = 'connected';
            try {
                s.sessionString = await encodeSession(folder);
            } catch (e) {
                s.status = 'failed';
                s.error = 'Could not read credentials after linking.';
            }
            setTimeout(() => cleanupSession(id, { removeFolder: true }), 5000);
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (s.status !== 'connected') {
                s.status = 'failed';
                s.error = statusCode === DisconnectReason.loggedOut
                    ? 'Logged out. Please try again.'
                    : 'Connection closed before linking finished. Please try again.';
                cleanupSession(id, { removeFolder: true });
            }
        }
    });

    return sock;
}

module.exports = {
    sessions,
    SESSIONS_DIR,
    isRateLimited,
    newId,
    encodeSession,
    decodeSession,
    cleanupSession,
    startSocket,
};
