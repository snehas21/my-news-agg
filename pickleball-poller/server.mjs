import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkPickleballAvailability } from './poller.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Poll state ─────────────────────────────────────────────────────────────
const state = {
  active: false,
  pollCount: 0,
  maxPolls: 0,
  intervalMinutes: 30,
  nextPollAt: null,     // epoch ms when next poll fires
  spotsFound: [],
  clients: new Set(),   // SSE response objects
};

// ── SSE helpers ─────────────────────────────────────────────────────────────
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of state.clients) res.write(msg);
}

function currentStatus() {
  return {
    type: 'status',
    active: state.active,
    pollCount: state.pollCount,
    maxPolls: state.maxPolls,
    intervalMinutes: state.intervalMinutes,
    nextPollAt: state.nextPollAt,
    spotsFound: state.spotsFound,
  };
}

// ── SSE endpoint ────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  state.clients.add(res);

  // Send current state immediately so the UI syncs on reconnect
  res.write(`data: ${JSON.stringify(currentStatus())}\n\n`);

  req.on('close', () => state.clients.delete(res));
});

// ── Start polling ────────────────────────────────────────────────────────────
app.post('/api/start', (req, res) => {
  if (state.active) {
    return res.status(409).json({ error: 'Already polling. Stop first.' });
  }

  const { pollCount, intervalMinutes } = req.body;
  if (!pollCount || pollCount < 1 || !intervalMinutes || intervalMinutes < 1) {
    return res.status(400).json({ error: 'Invalid pollCount or intervalMinutes.' });
  }

  state.active = true;
  state.pollCount = 0;
  state.maxPolls = parseInt(pollCount);
  state.intervalMinutes = parseInt(intervalMinutes);
  state.nextPollAt = null;
  state.spotsFound = [];

  res.json({ started: true });

  // Run in background (don't await)
  runPollingLoop();
});

// ── Stop polling ─────────────────────────────────────────────────────────────
app.post('/api/stop', (req, res) => {
  if (!state.active) return res.json({ stopped: false, reason: 'Not running' });

  state.active = false;
  state.nextPollAt = null;
  broadcast({ type: 'stopped', pollCount: state.pollCount });
  res.json({ stopped: true });
});

// ── Status endpoint (REST fallback) ──────────────────────────────────────────
app.get('/api/status', (_req, res) => res.json(currentStatus()));

// ── Polling loop ──────────────────────────────────────────────────────────────
async function runPollingLoop() {
  while (state.active && state.pollCount < state.maxPolls) {
    state.pollCount++;
    state.nextPollAt = null;

    broadcast({
      type: 'poll_start',
      pollCount: state.pollCount,
      maxPolls: state.maxPolls,
    });

    console.log(`\n[poll ${state.pollCount}/${state.maxPolls}] Starting check...`);

    try {
      const result = await checkPickleballAvailability();

      broadcast({
        type: 'poll_result',
        pollCount: state.pollCount,
        maxPolls: state.maxPolls,
        result,
      });

      if (result.available && result.spots.length > 0) {
        state.spotsFound = result.spots;
        broadcast({ type: 'spots_found', spots: result.spots, searchUrl: result.searchUrl });
        console.log(`[poll ${state.pollCount}] 🎉 SPOTS FOUND: ${result.spots.length} spot(s)`);
      } else {
        console.log(`[poll ${state.pollCount}] No spots available.`);
      }
    } catch (err) {
      console.error(`[poll ${state.pollCount}] Error:`, err.message);
      broadcast({ type: 'error', pollCount: state.pollCount, message: err.message });
    }

    // Wait between polls (unless this was the last one)
    if (state.active && state.pollCount < state.maxPolls) {
      const waitMs = state.intervalMinutes * 60 * 1000;
      state.nextPollAt = Date.now() + waitMs;
      broadcast({ type: 'waiting', intervalMinutes: state.intervalMinutes, nextPollAt: state.nextPollAt });

      console.log(`[poll ${state.pollCount}] Waiting ${state.intervalMinutes} min before next poll...`);
      await sleep(waitMs);
    }
  }

  if (state.active) {
    // Completed naturally
    state.active = false;
    state.nextPollAt = null;
    broadcast({ type: 'completed', pollCount: state.pollCount });
    console.log(`\n[done] Polling completed after ${state.pollCount} poll(s).`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (!state.active) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, ms);
  });
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏓 Pickleball Poller running at http://localhost:${PORT}`);
  console.log(`   Site: https://ca.apm.activecommunities.com/richmondhill/Home`);
  console.log(`   Searching for: Pickleball | Age 40-50 | Min 1 open spot\n`);
});
