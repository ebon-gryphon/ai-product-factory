const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// The fixture is inspected statically and must never be executed.
throw new Error('Static inspection fixture must not execute');

app.whenReady().then(() => {
  const window = new BrowserWindow({ webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  window.loadFile('index.html');
});
ipcMain.handle('notes:list', async () => [{ id: 'sample', text: 'Evidence example' }]);
