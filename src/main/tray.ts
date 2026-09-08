import { Tray, Menu, nativeImage, app } from 'electron';
import { getOverlayWindow } from './windows';
import { resourcePath } from './assets';

let tray: Tray | null = null;

/** The app icon at tray size. It carries its own dark tile, which is what lets
 *  one file serve both taskbar themes: the tile holds its shape against a
 *  light taskbar, and the mark on it glows against a dark one. A monochrome
 *  glyph would need two inks and a theme listener to swap them. */
function trayImage(): Electron.NativeImage {
  // The 64px cut rather than the 1024px one: downscaling by 4x keeps the
  // mark's edges cleaner than dropping straight from 1024 to 16.
  return nativeImage.createFromPath(resourcePath('tray-icon.png')).resize({ width: 16, height: 16 });
}

/** Builds the tray icon and its menu. The app has no taskbar presence, so this
 *  is the only always-available way to show/hide the overlay or quit. */
export function createTray(onOpenSettings: () => void): Tray {
  tray = new Tray(trayImage());
  tray.setToolTip('Syncity');

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
