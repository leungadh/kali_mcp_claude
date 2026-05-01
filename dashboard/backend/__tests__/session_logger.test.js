import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionLogger } from '../session_logger.js';

describe('SessionLogger', () => {
  let logger;

  beforeEach(() => { logger = new SessionLogger(':memory:'); });
  afterEach(() => { logger.close(); });

  it('createSession returns object with id and createdAt', () => {
    const session = logger.createSession('scan open ports');
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('createdAt');
    expect(typeof session.id).toBe('string');
  });

  it('createSession stores the prompt', () => {
    const session = logger.createSession('check for SQLi');
    const row = logger.getSession(session.id);
    expect(row.prompt).toBe('check for SQLi');
  });

  it('logEvent stores a typed event linked to a session', () => {
    const session = logger.createSession('test prompt');
    logger.logEvent(session.id, 'tool_call', { command: 'nmap -sV 10.0.2.100' });
    const events = logger.getEvents(session.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_call');
    expect(JSON.parse(events[0].payload).command).toBe('nmap -sV 10.0.2.100');
  });

  it('logEvent stores multiple events in order', () => {
    const session = logger.createSession('test multi');
    logger.logEvent(session.id, 'text', { content: 'hello' });
    logger.logEvent(session.id, 'tool_call', { command: 'id' });
    logger.logEvent(session.id, 'tool_result', { output: 'root' });
    const events = logger.getEvents(session.id);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('text');
    expect(events[2].type).toBe('tool_result');
  });

  it('listSessions returns all sessions newest first', () => {
    logger.createSession('first prompt');
    logger.createSession('second prompt');
    const sessions = logger.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0].prompt).toBe('second prompt');
  });

  it('closeSession sets the finished_at timestamp', () => {
    const session = logger.createSession('close test');
    logger.closeSession(session.id);
    const row = logger.getSession(session.id);
    expect(row.finished_at).not.toBeNull();
  });
});
