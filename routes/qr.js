/**
 * DILSHAN-MD — QR Code route
 * POST /api/qr/start  -> { id }
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
    cleanupSession,
} = require('../lib/sessionManager');

const router = express.Router();

router.post('/start', async (req, res) => {
    const ip = req.ip;
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    const id = newId();
    const folder = path.join(SESSIONS_DIR, id);
    await fs.ensureDir(folder);
    sessions.set(id, { status: 'pending', qr: null, folder, createdAt: Date.now() });

    try {
        const sock = await startSocket(id, folder);
        sessions.get(id).sock = sock;
        res.json({ id });
    } catch (e) {
        await cleanupSession(id);
        res.status(500).json({ error: 'Failed to start session.' });
    }
});

module.exports = router;
