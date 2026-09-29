/**
 * DILSHAN-MD — Pair Code / QR Session ID Generator
 * Main entry point. Route logic lives in routes/pair.js and routes/qr.js;
 * shared session/state logic lives in lib/sessionManager.js.
 */

const express = require('express');
const path = require('path');
const { sessions } = require('./lib/sessionManager');

const pairRouter = require('./routes/pair');
const qrRouter = require('./routes/qr');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.use('/api/pair', pairRouter);
app.use('/api/qr', qrRouter);

// Shared status poll for both flows
app.get('/api/status/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ status: 'expired' });

    res.json({
        status: s.status,
        qr: s.qr || null,
        code: s.code || null,
        sessionId: s.status === 'connected' ? s.sessionString : null,
        error: s.error || null,
    });
});

app.listen(PORT, () => {
    console.log(`DILSHAN-MD pair/QR site running on port ${PORT}`);
});
