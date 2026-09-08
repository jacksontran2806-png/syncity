// Reads .env at BUILD time. Only the redirect URI is baked in — the client ID
// deliberately is not: every install authenticates through a Spotify
// application the user registers themselves (see main/spotify/auth.ts), so
// there is nothing for a build to carry.
import 'dotenv/config';
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // The loopback address the Spotify login comes back to. Baked so a build
      // can move it off the default port if something else is using 8888; it
      // identifies nothing and is the same for everyone otherwise.
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
