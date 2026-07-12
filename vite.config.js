import { defineConfig } from 'vite';

// Relative base so the build works at any URL — github.io/<repo>/, a custom
// domain, or a local file server. Required for GitHub Pages project sites.
export default defineConfig({
  base: './',
});
