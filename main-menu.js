const { app, BrowserWindow, Menu, nativeTheme } = require('electron')
const isMac = process.platform === 'darwin'

const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Home',
        click: async () => { openHome(); }
      },
      //{ type: 'separator'},
      //{
      //    label: 'Toggle Light/Dark Mode',
      //    click: async() => { toggleDarkMode(); }
      //},
      {
        label: 'Preferences',
        click: async () => { openPreferences(); }
      },
      { type: 'separator' },
      {
        label: 'Play',
        click: async () => { startPlay(); },
        accelerator: "F1"
      },
      {
        label: 'Pause',
        click: async () => { pausePlay(); },
        accelerator: "F2"
      },
      {
        label: 'Next',
        click: async () => { nextPlay(); },
        accelerator: "F3"
      },
      {
        label: 'Fullscreen',
        click: async () => {
          toggleFullscreen();
        },
        accelerator: "F11"
      },
      //{
      //    label: 'Open Directory',
      //    click: async() => { openDirectory(); }
      //},
      //{
      //    label: 'Open File',
      //    click: async() => { openFile(); },
      //    accelerator: "CmdOrCtrl+O"
      //},
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
    ]
  }
]

if (process.env.NODE_ENV !== 'production') {
  template.push({
    label: 'Developer',
    submenu: [
      {
        label: 'Toggle Developer Tools',
        click: async () => {
          let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
          w.webContents.toggleDevTools();
        },
        accelerator: "F12"
      },
      //{ role: 'reload'}
    ]
  })
}

function toggleDarkMode() {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'dark'
  }
}

function openHome() {
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  w.loadURL(`file://${__dirname}/dist/my-angular-app/index.html#/viewer`)
  console.log('Open Home')
}

function openPreferences() {
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  w.loadURL('file://' + __dirname + '/dist/my-angular-app/index.html#/preferences')
  console.log('Open Preferences')
}

function openDirectory() {
  console.log('Open Directory')
}

function openFile() {
  console.log('Open File')
}

function startPlay() {
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  w.webContents.send('start');
}
function pausePlay() {
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  w.webContents.send('pause');
}
function nextPlay() {
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  w.webContents.send('next');
}

const contextTemplate = [
  {
    label: 'Options',
    submenu: [
      {
        label: 'Dow Something',
        click: async () => { console.log('Help!!!'); }
      }
    ]
  },
  {
    label: 'More Options'
  }
]

const toggleFullscreen = () => {
  //BrowserWindow.getFocusedWindow()
  let w = BrowserWindow.fromId(process.env.MAIN_WINDOW_ID * 1);
  if (w.isFullScreen()) {
    w.setFullScreen(false);
  } else {
    w.setFullScreen(true);
  }
}

module.exports.mainMenu = Menu.buildFromTemplate(template);
module.exports.popupMenu = Menu.buildFromTemplate(contextTemplate);

