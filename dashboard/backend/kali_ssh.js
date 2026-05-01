import { Client } from 'ssh2';
import fs from 'node:fs';

export class KaliSSH {
  /**
   * @param {{ host: string, user: string, keyPath: string }} config
   * @param {() => import('ssh2').Client} [clientFactory]  Injectable for testing.
   */
  constructor(config, clientFactory = () => new Client()) {
    this.config = config;
    this._clientFactory = clientFactory;
  }

  exec(command, timeout = 120_000) {
    return new Promise((resolve, reject) => {
      const client = this._clientFactory();
      let settled = false;
      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        client.end();
        fn(val);
      };

      const timer = setTimeout(
        () => settle(reject, new Error(`SSH command timed out after ${timeout}ms: ${command}`)),
        timeout,
      );

      client
        .on('ready', () => {
          client.exec(command, (err, channel) => {
            if (err) { clearTimeout(timer); return settle(reject, err); }
            let stdout = '';
            let stderr = '';
            let exitCode = 0;
            channel.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
            channel.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
            channel.on('exit', (code) => { exitCode = code ?? 0; });
            channel.on('close', () => {
              clearTimeout(timer);
              let result = stdout;
              if (exitCode !== 0 && stderr) result += `\n[stderr]\n${stderr}`;
              settle(resolve, result || '(no output)');
            });
          });
        })
        .on('error', (err) => { clearTimeout(timer); settle(reject, err); })
        .connect({
          host:         this.config.host,
          port:         22,
          username:     this.config.user,
          privateKey:   this.config.keyPath && fs.existsSync(this.config.keyPath)
                          ? fs.readFileSync(this.config.keyPath)
                          : undefined,
          readyTimeout: 15_000,
        });
    });
  }

  upload(localPath, remotePath, timeout = 60_000) {
    return new Promise((resolve, reject) => {
      const client = this._clientFactory();
      let settled = false;
      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        client.end();
        fn(val);
      };

      const timer = setTimeout(
        () => settle(reject, new Error(`SFTP upload timed out after ${timeout}ms: ${localPath}`)),
        timeout,
      );

      client
        .on('ready', () => {
          client.sftp((err, sftp) => {
            if (err) { clearTimeout(timer); return settle(reject, err); }
            sftp.fastPut(localPath, remotePath, (err2) => {
              clearTimeout(timer);
              sftp.end();
              if (err2) return settle(reject, err2);
              settle(
                resolve,
                `Uploaded ${localPath} → ${this.config.user}@${this.config.host}:${remotePath}`,
              );
            });
          });
        })
        .on('error', (err) => { clearTimeout(timer); settle(reject, err); })
        .connect({
          host:         this.config.host,
          port:         22,
          username:     this.config.user,
          privateKey:   this.config.keyPath && fs.existsSync(this.config.keyPath)
                          ? fs.readFileSync(this.config.keyPath)
                          : undefined,
          readyTimeout: 15_000,
        });
    });
  }
}

export function kaliSSHFromEnv() {
  return new KaliSSH({
    host:    process.env.KALI_HOST,
    user:    process.env.KALI_SSH_USER || 'ubuntu',
    keyPath: process.env.KALI_SSH_KEY_PATH?.replace(/^~/, process.env.HOME || ''),
  });
}
