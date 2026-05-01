import { describe, it, expect, vi, beforeEach } from 'vitest';

const makeChannelMock = ({ stdout = '', stderr = '', exitCode = 0 } = {}) => {
  const listeners = {};
  const stdoutStream = { on(event, cb) { listeners[`stdout:${event}`] = cb; return this; } };
  const stderrStream = { on(event, cb) { listeners[`stderr:${event}`] = cb; return this; } };
  const channel = {
    stdout: stdoutStream,
    stderr: stderrStream,
    on(event, cb) { listeners[`ch:${event}`] = cb; return this; },
    _emit() {
      if (stdout) listeners['stdout:data']?.(Buffer.from(stdout));
      listeners['stdout:close']?.();
      if (stderr) listeners['stderr:data']?.(Buffer.from(stderr));
      listeners['ch:exit']?.(exitCode);
      listeners['ch:close']?.();
    },
  };
  return channel;
};

const makeClientMock = (channelOpts = {}) => {
  const listeners = {};
  const channel = makeChannelMock(channelOpts);
  const client = {
    on(event, cb) { listeners[event] = cb; return this; },
    connect() { setImmediate(() => listeners['ready']?.()); },
    exec(cmd, cb) {
      setImmediate(() => { cb(null, channel); setImmediate(() => channel._emit()); });
    },
    sftp(cb) {
      const sftp = { fastPut(l, r, cb2) { setImmediate(() => cb2(null)); }, end() {} };
      setImmediate(() => cb(null, sftp));
    },
    end: vi.fn(),
  };
  return { client, channel };
};

describe('KaliSSH', () => {
  let KaliSSH;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../kali_ssh.js');
    KaliSSH = mod.KaliSSH;
  });

  it('exec resolves with stdout on success', async () => {
    const { client } = makeClientMock({ stdout: 'scan done\n', exitCode: 0 });
    const ssh = new KaliSSH(
      { host: '127.0.0.1', user: 'ubuntu', keyPath: '/tmp/fake.pem' },
      () => client,
    );
    const result = await ssh.exec('nmap -sV 10.0.2.100');
    expect(result).toBe('scan done\n');
    expect(client.end).toHaveBeenCalled();
  });

  it('exec appends stderr when exit code is non-zero', async () => {
    const { client } = makeClientMock({ stdout: 'partial', stderr: 'permission denied', exitCode: 1 });
    const ssh = new KaliSSH(
      { host: '127.0.0.1', user: 'ubuntu', keyPath: '/tmp/fake.pem' },
      () => client,
    );
    const result = await ssh.exec('sudo something');
    expect(result).toContain('partial');
    expect(result).toContain('permission denied');
  });

  it('exec returns "(no output)" when stdout is empty', async () => {
    const { client } = makeClientMock({ stdout: '', exitCode: 0 });
    const ssh = new KaliSSH(
      { host: '127.0.0.1', user: 'ubuntu', keyPath: '/tmp/fake.pem' },
      () => client,
    );
    const result = await ssh.exec('true');
    expect(result).toBe('(no output)');
  });

  it('upload resolves with success message', async () => {
    const { client } = makeClientMock();
    const ssh = new KaliSSH(
      { host: '10.0.0.1', user: 'ubuntu', keyPath: '/tmp/fake.pem' },
      () => client,
    );
    const msg = await ssh.upload('/tmp/local.py', '/tmp/remote.py');
    expect(msg).toContain('Uploaded');
    expect(msg).toContain('/tmp/local.py');
  });

  it('exec rejects on connection error', async () => {
    const listeners = {};
    const client = {
      on(event, cb) { listeners[event] = cb; return this; },
      connect() { setImmediate(() => listeners['error']?.(new Error('ECONNREFUSED'))); },
      end: vi.fn(),
    };
    const ssh = new KaliSSH(
      { host: '127.0.0.1', user: 'ubuntu', keyPath: '/tmp/fake.pem' },
      () => client,
    );
    await expect(ssh.exec('id')).rejects.toThrow('ECONNREFUSED');
  });
});
