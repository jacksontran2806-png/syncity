import type { LyriGlowApi } from './index';

declare global {
  interface Window {
    lyriglow: LyriGlowApi;
  }
}
