// Reads .env at BUILD time, so the values below can be baked into a packaged
// build. Nothing secret goes in: Spotify's desktop flow is Auth Code + PKCE,
// where the client ID is a public identifier and there is no client secret to
// leak (see main/spotify/auth.ts).
import 'dotenv/config';
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // A packaged app has no repo .env next to it and no reason to expect the
      // user to make one, so the build's credentials travel with it. At
      // runtime an actual environment variable — or a .env the user drops in
      // their own userData folder — still wins over these; see main/index.ts.
      __SPOTIFY_CLIENT_ID__: JSON.stringify(process.env.SPOTIFY_CLIENT_ID ?? ''),
      __SPOTIFY_REDIRECT_URI__: JSON.stringify(process.env.SPOTIFY_REDIRECT_URI ?? ''),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
  },
});
