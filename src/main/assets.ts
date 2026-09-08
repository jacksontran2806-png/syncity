// Where the app's own image files live, in dev and once packaged.
//
// The two are not the same path and never can be: in dev the main process runs
// from out/main and resources/ sits two levels up in the repo; in a packaged
// build the app code is inside app.asar and resources/ is copied alongside it
// by electron-builder (see extraResources in electron-builder.yml). Getting
// this wrong is invisible in dev and ships an app with no tray icon, so it is
// resolved in one place rather than at each call site.

import { app } from 'electron';
import path from 'node:path';

export function resourcePath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(__dirname, '../../resources', file);
}
