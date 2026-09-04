import type { SyncityApi } from './index';

declare global {
  interface Window {
    syncity: SyncityApi;
  }
}
