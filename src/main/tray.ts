import { Tray, Menu, nativeImage, app, nativeTheme } from 'electron';
import { getOverlayWindow } from './windows';
import { resourcePath } from './assets';

let tray: Tray | null = null;

/** Windows does not invert a tray icon to suit the taskbar, so the app ships
 *  both inks and picks by theme — a white glyph is invisible on a light
 *  taskbar, and vice versa. */
function trayImage(): Electron.NativeImage {
  const file = nativeTheme.shouldUseDarkColors ? 'tray-icon.png' : 'tray-icon-light.png';
  return nativeImage.createFromPath(resourcePath(file)).resize({ width: 16, height: 16 });
}

/** Builds the tray icon and its menu. The app has no taskbar presence, so this
 *  is the only always-available way to show/hide the overlay or quit. */
export function createTray(onOpenSettings: () => void): Tray {
  tray = new Tray(trayImage());
  tray.setToolTip('Syncity');
  // The taskbar can change colour under a running app (theme switch, or the
  // scheduled light/dark change Windows offers), and a tray icon that only
  // matched at launch would quietly disappear.
  nativeTheme.on('updated', () => tray?.setImage(trayImage()));

  const rebuildMenu = () => {
    const win = getOverlayWindow();
    const visible = win?.isVisible() ?? false;
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? 'Hide Overlay' : 'Show Overlay',
        click: () => {
          if (!win) return;
          if (win.isVisible()) win.hide();
          else win.show();
          rebuildMenu();
        },
      },
      { label: 'Settings', click: onOpenSettings },
      { type: 'separator' },
      { label: 'Quit Syncity', click: () => app.quit() },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on('click', rebuildMenu);
  return tray;
}
