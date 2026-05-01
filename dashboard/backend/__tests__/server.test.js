import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../claude_client.js', () => ({
  ClaudeClient: class {
    run(prompt, onEvent) {
      return Promise.resolve().then(async () => {
        await onEvent({ type: 'text', content: 'Scanning...' });
        await onEvent({ type: 'done' });
      });
    }
  },
  claudeClientFromEnv: () => ({ run: async (p, cb) => { await cb({ type: 'done' }); } }),
}));

vi.mock('../kali_ssh.js', () => ({
  KaliSSH: class {},
  kaliSSHFromEnv: () => ({ exec: vi.fn().mockResolvedValue('ok') }),
}));

vi.mock('../session_logger.js', async () => {
  const real = await vi.importActual('../session_logger.js');
  return {
    SessionLogger: class extends real.SessionLogger {
      constructor() { super(':memory:'); }
    },
  };
});

let app;
beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.TARGET_PRIVATE_IP = '10.0.2.100';
  process.env.KALI_HOST         = '127.0.0.1';
  process.env.KALI_SSH_USER     = 'ubuntu';
  process.env.KALI_SSH_KEY_PATH = '/tmp/fake.pem';
  const mod = await import('../server.js');
  app = mod.app;
});

describe('POST /api/session', () => {
  it('returns 400 when prompt is missing', async () => {
    const res = await request(app).post('/api/session').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt/i);
  });

  it('returns 201 with sessionId when prompt is provided', async () => {
    const res = await request(app).post('/api/session').send({ prompt: 'scan open ports' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('sessionId');
    expect(typeof res.body.sessionId).toBe('string');
  });
});

describe('GET /api/sessions', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('includes a session created via POST /api/session', async () => {
    await request(app).post('/api/session').send({ prompt: 'list sessions test' });
    const res = await request(app).get('/api/sessions');
    expect(res.body.map((s) => s.prompt)).toContain('list sessions test');
  });
});

describe('GET /api/session/:id/stream', () => {
  it('returns 404 for unknown session id', async () => {
    const res = await request(app)
      .get('/api/session/nonexistent-id-xyz/stream')
      .set('Accept', 'text/event-stream');
    expect(res.status).toBe(404);
  });

  it('returns SSE content-type for a known session', async () => {
    const createRes = await request(app).post('/api/session').send({ prompt: 'stream test' });
    const { sessionId } = createRes.body;
    const res = await request(app)
      .get(`/api/session/${sessionId}/stream`)
      .set('Accept', 'text/event-stream')
      .timeout(2000);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });
});
