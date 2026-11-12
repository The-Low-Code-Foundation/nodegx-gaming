// Optional. Serves this folder and lends the other captains a voice from a local model (Ollama), for the drop-in
// mission's radio. The game does not need it: any static server plays the whole game with scripted voices.
//   node tools/llm-server.mjs [--port 8787]
//   then open http://127.0.0.1:8787/?llm=on   (needs Ollama running, and the model pulled: ollama pull gemma4:e4b-it-qat)
// GET /api/llm says which models Ollama has; POST /api/llm is one chat, passed through to Ollama unchanged.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8787;
const OLLAMA = process.env.OLLAMA_HOST?.startsWith('http') ? process.env.OLLAMA_HOST : 'http://127.0.0.1:11434';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/api/llm') return llm(req, res);
    let file = path.join(root, url);
    if (!file.startsWith(root)) return (res.writeHead(403), res.end());
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return (res.writeHead(404), res.end('not found'));
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`threadspace with AI voices at http://127.0.0.1:${port}/?llm=on`));

async function llm(req, res) {
  const json = (code, body) => (res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }), res.end(JSON.stringify(body)));
  try {
    if (req.method === 'GET') {
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const tags = await r.json();
      return json(200, { ok: true, models: (tags.models ?? []).map((m) => m.name) });
    }
    let body = '';
    for await (const c of req) {
      body += c;
      if (body.length > 100_000) return json(413, { ok: false, error: 'too long' });
    }
    // The browser gave up (a timeout, a skip): stop the model too, or the next hail waits behind this one.
    const gone = new AbortController();
    res.on('close', () => res.writableEnded || gone.abort());
    const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: gone.signal });
    res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(await r.text());
  } catch {
    if (!res.headersSent) json(502, { ok: false, error: 'no model server on this machine' });
  }
}
