import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export class SessionLogger {
  constructor(dbPath = './sessions.sqlite') {
    this.db = new Database(dbPath);
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        prompt      TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        type       TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  createSession(prompt) {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO sessions (id, prompt, created_at) VALUES (?, ?, ?)')
      .run(id, prompt, createdAt);
    return { id, createdAt };
  }

  getSession(id) {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  }

  listSessions() {
    return this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC, rowid DESC')
      .all();
  }

  closeSession(id) {
    this.db
      .prepare('UPDATE sessions SET finished_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  logEvent(sessionId, type, payload) {
    this.db
      .prepare(
        'INSERT INTO events (session_id, type, payload, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(sessionId, type, JSON.stringify(payload), new Date().toISOString());
  }

  getEvents(sessionId) {
    return this.db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY id ASC')
      .all(sessionId);
  }

  close() {
    this.db.close();
  }
}
