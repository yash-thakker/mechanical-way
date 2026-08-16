// Serves dist/ the way a real static host does — which, for this project, means
// one specific behaviour nothing else local gets right: an unmatched path must
// return 404.html WITH a 404 status.
//
//   python3 -m http.server   emits its own "Error response" page
//   vite preview             hands back index.html (SPA fallback)
//
// Both hide whether the off-branch page actually works. Hence this.
//
//   npm run preview:site                    → http://localhost:5173/
//   npm run preview:site -- --base /repo/   → http://localhost:5173/repo/
//                                             (mimics a GitHub Pages project site)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 5173));
// normalised to a leading and trailing slash, so '/repo' and 'repo/' both work
const BASE = `/${String(arg('base', '/')).replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function readIfFile(path) {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // outside the base is off-site: nothing to serve, not even the 404 page
  if (BASE !== '/' && !pathname.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Not on this site. Try ${BASE}\n`);
  }
  pathname = pathname.slice(BASE.length - 1) || '/';

  // '..' must not climb out of dist/
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, rel);
  if (pathname.endsWith('/')) file = join(file, 'index.html');

  let body = await readIfFile(file);
  // a bare directory redirects to its slashed form, like every real host
  if (!body && !pathname.endsWith('/')) {
    const asIndex = await readIfFile(join(file, 'index.html'));
    if (asIndex) {
      res.writeHead(301, { Location: `${pathname}/` });
      return res.end();
    }
  }

  if (body) {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    return res.end(body);
  }

  // THE POINT OF THIS FILE: unmatched path → the off-branch page, status 404
  const notFound = await readIfFile(join(DIST, '404.html'));
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(notFound || 'Not found (and dist/404.html is missing — run npm run build)\n');
}).listen(PORT, () => {
  console.log(`dist/ on http://localhost:${PORT}${BASE}`);
  console.log(`unmatched paths serve 404.html — try http://localhost:${PORT}${BASE}hello`);
});
