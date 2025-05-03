const { app, BrowserWindow, Menu, powerSaveBlocker } = require('electron/main')
const path = require('path');
const { imageSizeFromFile } = require('image-size/fromFile');
const fs = require('fs');
const exif = require('exif').ExifImage;

const { mainMenu, popupMenu} = require("./main-menu")
const { ipcMain, dialog, shell } = require('electron');

let win;
function createWindow () {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: true,
    fullscreenable: true,
    webPreferences: {
      //preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  process.env.MAIN_WINDOW_ID = win.id;
  win.loadURL(`file://${__dirname}/dist/my-angular-app/index.html`)

  Menu.setApplicationMenu(mainMenu)

  win.webContents.on("context-menu", () => {
    popupMenu.popup(win.webContents);
  })

  win.on('resize', () => {
    const [width, height] = win.getSize();
    //console.log(`Window size: ${width} x ${height}`);
  });

  // win.webContents.openDevTools();

  let blockerId = powerSaveBlocker.start('prevent-display-sleep');

  win.on('closed', function () {
    powerSaveBlocker.stop(blockerId);
    win = null;
  })
}

app.on('ready', function () {
    createWindow()
})

app.on('activate', () => {
    //if (BrowserWindow.getAllWindows().length === 0) {
     //   createWindow()
    //}
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

ipcMain.on('message', (event, message) => {
  console.log("Message from Renderer:", message);
});

ipcMain.handle('open-file-dialog', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  });
  return filePaths;
});

ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];

  }
    return "";
});

ipcMain.handle('save-file', async (event, message) => {

  try {
    const appDataPath = app.getPath('userData');
    let filePath = path.join(appDataPath, "digital-picture-preferences.json");

    //console.log(fPath);

    //let options = {
    //  title: "Save file",
    //  defaultPath: fPath,
    //  buttonLabel: "Save",

    //  filters: [
    //    { name: 'json', extensions: ['json'] },
    //    { name: 'All Files', extensions: ['*'] }
    //  ]
    //};

    //console.log(message);

    //dialog.showSaveDialog(null, options).then(({ filePath }) => {
      fs.writeFileSync(filePath, message, 'utf-8');
    //});
  }
  catch (error) {
    console.log(error);
  }
});

ipcMain.handle('default-directory', async () => {
  let filePath = path.join(__dirname, "src/assets/e-masque.png");
  return filePath;
});

ipcMain.handle('load-file', async () => {
  let json = "";
  try {
    const appDataPath = app.getPath('userData');
    let filePath = path.join(appDataPath, "digital-picture-preferences.json");
    json = fs.readFileSync(filePath, 'utf-8');
  }
  catch (error) {
    //console.log(error);
    json = "";
  }
  return json;
});

ipcMain.handle('get-files-directories', async (event, directoryPath) => {
  let json = [];
  try {
    json = fs.readdirSync(directoryPath, 'utf-8');
  }
  catch (error) {
    json = "";
    console.log(error);
  }
  return json;
});

ipcMain.handle('get-files-directories-stats', async (event, directoryPath, files) => {
  let json = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(directoryPath, files[i]);
      const stats = fs.statSync(filePath); // Use fs.stat for async
      json.push({
        name: files[i],
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        modifiedAt: stats.mtime
      });
    }
  }
  catch (error) {
    console.log(error);
  }
  return json;
});

ipcMain.handle('get-image-dimensions', async (event, imagePath) => {
  let imgDim = { width: 0, height: 0, orientation: 1 };
  try {
    const dimensions = await imageSizeFromFile(imagePath);
    imgDim.width = dimensions.width;
    imgDim.height = dimensions.height;

    //console.log(JSON.stringify(imgDim));

  } catch (error) {
    console.error('Error getting image dimensions:', error);
  }
  return imgDim;
});

ipcMain.handle('get-image-orientation', async (event, imagePath) => {
  return new Promise((resolve, reject) => {
    new exif({ image: imagePath }, (error, exifData) => {
      if (error) {
        //return reject(error);
        console.log(error);
        resolve(-1);
      }
      const orientation = exifData?.image?.Orientation;
      //console.log("O: " + orientation);
      resolve(orientation);
    });
  });
});

//ipcMain.on('open-directory-dialog', async (event) => {
//  const result = await dialog.showOpenDialog({
//    properties: ['openDirectory']
//  });
//  if (!result.canceled && result.filePaths.length > 0) {
//   // callback(result.filePaths[0]);
//    shell.openPath(result.filePaths[0]).then(result => {
//      if (result === '') {
//        console.log('Directory opened successfully');
//      } else {
//        console.error('Failed to open directory:', result);
//      }
//    });
//  }
//  else {
//   // callback( "");
//  }
//});
