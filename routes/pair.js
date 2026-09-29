/**
 * DILSHAN-MD — Pair Code route
 * POST /api/pair/start  { number }  -> { id }
 */

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const {
    sessions,
    SESSIONS_DIR,
    isRateLimited,
    newId,
    startSocket,
} = require('../lib/sessionManager');

const router = express.Router();

router.post('/start', async (req, res) => {
    const ip = req.ip;
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    let { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number is required.' });
    number = String(number).replace(/[^0-9]/g, '');
    if (number.length < 8) return res.status(400).json({ error: 'Invalid phone number.' });

    const id = newId();
    const folder = path.join(SESSIONS_DIR, id);
    await fs.ensureDir(folder);
    sessions.set(id, { status: 'pending', code: null, folder, createdAt: Date.now() });

    try {
        const sock = await startSocket(id, folder);
        sessions.get(id).sock = sock;

        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(number);
                    const s = sessions.get(id);
                    if (s) {
                        s.code = code?.match(/.{1,4}/g)?.join('-') || code;
                        s.status = 'code';
                    }
                }
            } catch (e) {
                const s = sessions.get(id);
                if (s) {
                    s.status = 'failed';
                    s.error = 'Could not generate pairing code. Check the number and try again.';
                }
            }
        }, 2500);

        res.json({ id });
    } catch (e) {
        res.status(500).json({ error: 'Failed to start session.' });
    }
});

module.exports = router;
