import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { SessionLogger } from './session_logger.js';
import { ClaudeClient } from './claude_client.js';
import { kaliSSHFromEnv } from './kali_ssh.js';

const PORT = process.env.PORT ?? 3001;

const logger = new SessionLogger('./sessions.sqlite');
const ssh    = kaliSSHFromEnv();

// sessionId → Set<res> (live SSE subscribers)
const sseClients = new Map();
// sessionId → boolean (agentic loop finished)
const sessionDone = new Map();

export const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/session', async (req, res) => {
  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required and must be a non-empty string' });
  }

  const session = logger.createSession(prompt.trim());
  const { id: sessionId } = session;

  sseClients.set(sessionId, new Set());
  sessionDone.set(sessionId, false);

  const claudeClient = new ClaudeClient({
    targetIp: process.env.TARGET_PRIVATE_IP ?? '10.0.2.100',
  });

  (async () => {
    const broadcast = async (event) => {
      const payload = JSON.stringify(event);
      logger.logEvent(sessionId, event.type, event);
      for (const client of (sseClients.get(sessionId) ?? [])) {
        client.write(`data: ${payload}\n\n`);
      }
    };

    try {
      await claudeClient.run(prompt, broadcast, (cmd) => ssh.exec(cmd));
    } catch (err) {
      await broadcast({ type: 'error', message: err.message });
    } finally {
      logger.closeSession(sessionId);
      sessionDone.set(sessionId, true);
      for (const client of (sseClients.get(sessionId) ?? [])) {
        client.end();
      }
      sseClients.delete(sessionId);
      sessionDone.delete(sessionId);
    }
  })();

  return res.status(201).json({ sessionId });
});

app.get('/api/session/:id/stream', async (req, res) => {
  const { id } = req.params;
  const session = logger.getSession(id);
  if (!session) return res.status(404).json({ error: `Session ${id} not found` });

  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',      'no-cache');
  res.setHeader('Connection',         'keep-alive');
  res.setHeader('X-Accel-Buffering',  'no');
  res.flushHeaders();

  const alreadyDone = sessionDone.get(id) ?? true;

  for (const row of logger.getEvents(id)) {
    res.write(`data: ${row.payload}\n\n`);
  }

  if (alreadyDone) { res.end(); return; }

  const clients = sseClients.get(id);
  if (!clients) { res.end(); return; }
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/api/sessions', (_req, res) => {
  res.json(logger.listSessions());
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[server] AI PenTest backend running on http://localhost:${PORT}`);
    console.log(`[server] Target IP: ${process.env.TARGET_PRIVATE_IP ?? '10.0.2.100'}`);
    console.log(`[server] Kali host: ${process.env.KALI_HOST}`);
  });
}
