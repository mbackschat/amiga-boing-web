import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Production build is a single self-contained dist/index.html — inlines JS,
// CSS, and the boing.samples PCM (24706 bytes) as a base64 data URL via
// assetsInlineLimit. The result works under file:// in every modern browser
// (no module loader, no fetch of local files, no CORS).
//
// Dev server (`npm run dev`) is unaffected; the plugin only runs on build.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: 100000,
  },
});
