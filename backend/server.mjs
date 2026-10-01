import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import apiRouter from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

app.use(apiRouter);

const TYPES = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  woff2: 'font/woff2',
  ico: 'image/x-icon',
};

app.use((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.path);
  } catch {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const isAdmin = urlPath === '/admin' || urlPath.startsWith('/admin/');
  const base = isAdmin ? path.join(root, 'admin-dist') : path.join(root, 'dist/client');
  let relative = isAdmin ? urlPath.slice(6) : urlPath;
  if (relative === '' || relative === '/') relative = '/index.html';

  let baseReal, fileReal;
  try {
    baseReal = fs.realpathSync(base);
    fileReal = fs.realpathSync(path.join(base, relative));
  } catch {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  if (!fileReal.startsWith(baseReal + path.sep) || !fs.statSync(fileReal).isFile()) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const ext = path.extname(fileReal).slice(1);
  if (!TYPES[ext]) {
    res.status(404).end();
    return;
  }
  res.set('Content-Type', TYPES[ext]);
  if (ext === 'html') res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(fileReal).pipe(res);
});

const port = Number(process.env.PORT || 2801);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Node backend listening on http://${host}:${port}`);
});
