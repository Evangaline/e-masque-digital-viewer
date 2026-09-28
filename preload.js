const { contextBridge, ipcRenderer } = require('electron');

//ONLY THESE CHANNELS CAN BE USED FROM THE RENDERER
const invokeChannels = [
  'open-directory-dialog',
  'save-file',
  'default-directory',
  'load-file',
  'get-files-directories',
  'get-files-directories-stats',
  'get-image-dimensions',
  'get-image-orientation',
  'load-focus-cache',
  'save-focus-cache',
  'set-fullscreen',
  'is-fullscreen',
  'set-theme'
];
const receiveChannels = ['start', 'pause', 'next', 'fullscreen-on', 'fullscreen-off'];

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message) => ipcRenderer.send('message', message),
  invoke: (channel, ...args) => {
    if (!invokeChannels.includes(channel)) {
      return Promise.reject(new Error('IPC channel not allowed: ' + channel));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  //RETURNS A FUNCTION THAT REMOVES THE LISTENER
  on: (channel, listener) => {
    if (!receiveChannels.includes(channel)) {
      return () => { };
    }
    const handler = () => listener();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
