import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';
import { getOverlayWindow } from './windows';

let tray: Tray | null = null;

export function createTray(onOpenSettings: () => void): Tray {
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('LyriGlow');

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
      { label: 'Quit LyriGlow', click: () => app.quit() },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on('click', rebuildMenu);
  return tray;
}
