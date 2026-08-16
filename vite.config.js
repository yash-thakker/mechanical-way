import { defineConfig, loadEnv } from 'vite';
import { render as render404 } from './scripts/build-404.mjs';

// The game has no router — a single index.html. Any other path is the host's
// 404, so we ship a 404.html for the host to serve there (GitHub Pages, Netlify
// and Cloudflare Pages all pick it up automatically).
//
// It is emitted whole rather than built as a second entry BECAUSE it is served
// for arbitrary paths: with base './' a bundled asset link would resolve against
// whatever bogus directory the visitor typed. Self-contained is the only shape
// that survives /a, /a/b and /a/b/c alike.
function offBranchPage(env) {
  return {
    name: 'mw-404',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: render404({ pageUrl: env.VITE_PAGE_URL || '' }),
      });
    },
  };
}

// Relative base so the build works at any URL — github.io/<repo>/, a custom
// domain, or a local file server. Required for GitHub Pages project sites.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [offBranchPage(env)],
  };
});
