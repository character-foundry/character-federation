import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';

// A fresh local D1/SQLite database for every invocation. Never reuse app data.
const state = mkdtempSync(join(tmpdir(), 'federation-e2e-'));
const wrangler = join(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');
const shared = ['--config', 'wrangler.e2e.jsonc', '--local', '--persist-to', state];
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
delete env.DATABASE_PATH;

function seed(file) {
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'cardshub-e2e', ...shared, '--file', file], {
    env,
    stdio: 'inherit',
  });
}

seed('src/lib/db/schema.sql');
const seedFile = join(state, 'users.sql');
const hash = bcrypt.hashSync('local-browser-test-password', 4);
writeFileSync(seedFile, `
  INSERT INTO users (id, username, password_hash, is_admin, provider)
    VALUES ('e2e-admin', 'browser-admin', '${hash}', 1, 'local'),
           ('e2e-user', 'browser-user', '${hash}', 0, 'local');
  INSERT INTO settings (key, value)
    VALUES ('maintenance_mode', '{"enabled":true,"message":"Browser test maintenance"}');
`);
seed(seedFile);

const server = spawn(process.execPath, [wrangler, 'dev', ...shared, '--ip', '127.0.0.1', '--port', '16145', '--local-protocol', 'https'], {
  env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.on('exit', (code) => process.exit(code ?? 1));
