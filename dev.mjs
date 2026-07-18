import { spawn } from 'node:child_process';
const api = spawn(process.execPath, ['server.mjs'], { stdio: 'inherit' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' });
const stop = () => { api.kill('SIGTERM'); vite.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api.on('exit', code => code && (vite.kill(), process.exit(code)));
vite.on('exit', code => code && (api.kill(), process.exit(code)));
