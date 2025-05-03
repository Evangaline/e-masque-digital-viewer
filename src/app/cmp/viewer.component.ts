import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { timer, Subscription } from 'rxjs';

import { IpcRenderer, BrowserWindow } from 'electron';

import { Prefereneces, PlayListItem, DirectoryEntry } from '../cls/index';
import { PreferenceService } from '../srv/index';

@Component({
  selector: 'app-viewer',
  standalone: false,
  templateUrl: './viewer.component.html'
})
export class ViewerComponent implements OnInit, OnDestroy {
  title = 'E-MASQUE Interactive - Digital Picture';

  private ipcRenderer: IpcRenderer = (window as any).require('electron').ipcRenderer;
  private timerSubscription: Subscription | undefined;
  private interval: any;
  private time: number = (1000 * 60) * 5;

  public preferences: Prefereneces = new Prefereneces();
  public maxCount: number = 0;
  public isPaused: boolean = false;
  public showPlay: boolean = false;
  public playStart: number = 0;
  public timeLeft: number = 10;

  public image: string = "";
  public windowWidth: number = 0;
  public windowHeight: number = 0;
  public imageDisplay: string = "width:200px";
  public backgroundImage: string = "";

  public printList: PlayListItem[] = [];
  public cursorTimer: any;
  public cursorTimerDuration = 5000;
  public alignAdjustment: string = "";

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.updateWindowSize();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: any) {
    this.resetTimer();
  }
  @HostListener('window:mousedown', ['$event'])
  onMouseDown(event: any) {
    this.resetTimer();
  }
  @HostListener('window:mouseup', ['$event'])
  onMouseUp(event: any) {
    this.resetTimer();
  }
  @HostListener('window:wheel', ['$event'])
  onWheel(event: any) {
    this.resetTimer();
  }

  constructor(
    private router: Router,
    private ref: ChangeDetectorRef,
    private prefService: PreferenceService) {

    this.image = "";
    this.prefService.getPreferences$.subscribe(pref => this.setPreferences(pref));

    this.ipcRenderer.on("start", () => {
      //console.log("start");
      this.play();
    });
    this.ipcRenderer.on("pause", () => {
      //console.log("pause");
      this.pause()
    });
    this.ipcRenderer.on("next", () => {
      //console.log("next");
      this.showNextPicture();
    });
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  ngOnInit() {
    this.windowWidth = window.innerWidth;
    this.windowHeight = window.innerHeight;

    this.begin();
  }
  public begin(): void {
    if ((this.image == "") && (this.preferences.playlist != null) && (this.preferences.playlist.length > 0)) {
      this.setPrintList();
      this.showNextPicture();
      this.updateWindowSize();
      this.start();
    }
  }

  public setPreferences(pref: Prefereneces): void {
    this.preferences = Prefereneces.fromJSON(pref);
    if (this.preferences.interval == "M") {
      this.time = (1000 * 60) * this.preferences.timer;
    }
    else {
      this.time = 1000 * this.preferences.timer;
    }
    this.timeLeft = this.time;
    //console.log("set preferences");
    //console.log("Preferences: " + JSON.stringify(this.preferences))
    this.begin();
  }
  public setPrintList(): void {
    this.printList = [];
    let max: number = 30;
    if (this.preferences.playlist.length < 30) {
      max = this.preferences.playlist.length;
    }
    for (let i = 0; i < max; i++) {
      this.printList.push(this.preferences.playlist[i]);
    }
  }

  public createPlaylist(): void {
    if ((this.preferences.directories != null) && (this.preferences.directories.length > 0)) {
      this.pause();

      this.preferences.playlist = [];
      this.maxCount = 0;
      for (let i = 0; i < this.preferences.directories.length; i++) {
        if ((this.preferences.directories[i].path != null) && (this.preferences.directories[i].path != "")) {
          this.addDirectoryFiles(this.preferences.directories[i].path, this.preferences.directories[i].include);
        }
      }

      this.play();
    }
  }
  public loadPlaylist(): void {
    if ((this.preferences.playlist == null) || (this.preferences.playlist.length == 0)) {
      this.createPlaylist();
    }
  }
  public clearPlaylist(): void {
    this.preferences.playlist = [];
    this.ipcRenderer.invoke("save-file", JSON.stringify(this.preferences));
    this.prefService.setPreferences(this.preferences);
  }
  public printPlaylist(): void {
    this.showPlay = !this.showPlay;
    if (this.showPlay == false) {
      this.playStart = 0;
      this.printList = [];
    }
    else {
      this.setPrintList();
    }
    //for (let j = 0; j < this.preferences.playlist.length; j++) {
    //  console.log(this.preferences.playlist[j].path)
    //}
  }
  public addDirectoryFiles(path: string, inc: boolean): void {

    this.ipcRenderer.invoke("get-files-directories", path).then(files => {
      this.ipcRenderer.invoke("get-files-directories-stats", path, files).then(stats => {

        let subDirs = [];
        if (inc == true) {
          subDirs = stats.filter((f: any) => f.isDirectory == true);
        }

        //GET FILES
        stats = stats.filter((f: any) => f.isDirectory == false);

        //ORDER BY PREFERENCES
        if (this.preferences.orderby == "CREATED") {
          if (this.preferences.direction == "DESC") {
            stats.sort((a: any, b: any) => a.modifiedAt - b.modifiedAt);
          }
          else {
            stats.sort((a: any, b: any) => b.modifiedAt - a.modifiedAt);
          }
        }
        else {
          if (this.preferences.direction == "DESC") {
            stats.sort((a: any, b: any) => a.name.localeCompare(b.name));
          }
          else {
            stats.sort((a: any, b: any) => b.name.localeCompare(a.name));
          }
        }

        //GENERATE LIST
        for (let j = 0; j < stats.length; j++) {
          let fAry = stats[j].name.split(".");
          if ((fAry[1].toLowerCase() == "jpg") || (fAry[1].toLowerCase() == "jpeg") || (fAry[1].toLowerCase() == "png") || (fAry[1].toLowerCase() == "gif")) {
            this.maxCount += 1;
            let pItem: PlayListItem = new PlayListItem();
            pItem.sequence = this.maxCount;
            pItem.path = path + "/" + stats[j].name
            this.preferences.playlist.push(pItem);
          }
        }

        if (subDirs.length > 0) {
          for (let j = 0; j < subDirs.length; j++) {
            this.addDirectoryFiles(path + "/" + subDirs[j].name, inc);
          }
        }

        //SAVE PLAYLIST
        //console.log(JSON.stringify(this.preferences));
        this.ipcRenderer.invoke("save-file", JSON.stringify(this.preferences));
        this.prefService.setPreferences(this.preferences);
      });
    });
  }

  public start(): void {
    this.isPaused = false;
    if ((!this.timerSubscription) || (this.timerSubscription.closed == true)) {
      this.startTimer();
    }
  }
  public startTimer() {
    this.timerSubscription = timer(0, 1).subscribe(() => {
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.timeLeft = this.time;
        this.showNextPicture();
      }
      this.ref.detectChanges();
    });
  }
  public stopTimer() {
    this.timeLeft = this.time;
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  public showPreviousPicture(): void {
    this.image = this.preferences.lastPlayed;
    this.preferences.lastPlayed = '';
    this.stopTimer();
    this.positionImage();
    this.startTimer();
  }
  public showNextPicture(): void {
    this.preferences.lastPlayed = this.image;
    this.image = this.preferences.playlist[0].path;
    if (this.preferences.directories.length > 0) {
      this.preferences.playlist.splice(0, 1);
    }

    if (this.preferences.playlist.length == 0) {
      if (this.preferences.directories.length > 0) {
        this.createPlaylist();
      }
    }
    else {
      this.ipcRenderer.invoke("save-file", JSON.stringify(this.preferences));
      this.prefService.setPreferences(this.preferences);
    }

    this.stopTimer();
    this.positionImage();
    this.startTimer();
  }

  public positionImage() {
    if (this.preferences.crop == true) {
      this.advancedPosition();
    }
    else {
      this.advancedPosition();
      //this.basicPosition();
    }
  }
  public basicPosition() {
    this.alignAdjustment = "text-align:center;"
    this.imageDisplay = "position:relative;height:100%;";

    this.backgroundImage = "";
    if (this.preferences.useimage == true) {
      let path: string = this.image.replace(/\\/g, "/");
      this.backgroundImage = "background-image:url(\"file:" + path + "\")";
      this.backgroundImage += ";background-repeat:no-repeat"
      this.backgroundImage += ";background-position: center";
      this.backgroundImage += ";background-size: cover";
    }
  }
  public advancedPosition() {
    this.ipcRenderer.invoke("get-image-dimensions", this.image).then(dimensions => {
      this.ipcRenderer.invoke("get-image-orientation", this.image).then(orientation => {
        dimensions.orientation = orientation;

        if ((dimensions.orientation == null) || (dimensions.orientation == -1)) {
          if (dimensions.width > dimensions.height) {
            dimensions.orientation = 1;
          }
          else {
            dimensions.orientation = 1;
          }
        }
		
		//1: Normal orientation (no rotation).
		//3: 180-degree rotation.
		//6: 90-degree clockwise rotation.
		//8: 90-degree counter-clockwise rotation.
        this.alignAdjustment = ""
        this.backgroundImage = "";
        if (this.preferences.useimage == true) {
          let path: string = this.image.replace(/\\/g, "/");
          console.log(path);
          this.backgroundImage = "background-image:url(\"file:" + path + "\")";
          this.backgroundImage += ";background-repeat:no-repeat"
          this.backgroundImage += ";background-position: center";
          this.backgroundImage += ";background-size: cover";
        }

        console.log("O: " + dimensions.orientation);
        //console.log("Image: " + this.image);
        console.log("W Height: " + this.windowHeight);
        console.log("W Width: " + this.windowWidth);
        console.log("I Width: " + dimensions.width);
        console.log("I Height: " + dimensions.height);
        //console.log("Crop: " + this.preferences.crop);

        if (this.preferences.crop == true) {

          if (dimensions.width == 0) {
            this.basicPosition();
          }
          else {
            console.log("0");

            let w1: number = this.windowWidth;
            let h1: number = (this.windowWidth / dimensions.width) * dimensions.height;

            console.log("0a");

            if (dimensions.orientation == 1) {
              if (this.windowHeight > h1) {
                console.log("1");
                let w2: number = (this.windowHeight / dimensions.height) * dimensions.width;

                if (w2 < this.windowWidth) {
                  console.log("1a");
                  let h2: number = (this.windowWidth / dimensions.width) * dimensions.height;

                  this.imageDisplay = "position:relative;width:100%;";
                  if (this.preferences.position == "CENTER") {
                    let tp: number = (h2 - this.windowHeight) / 2;
                    this.imageDisplay += "top:-" + tp + "px;left:0px;"
                  }
                  else {
                    this.imageDisplay += "top:0px;left:0px;"
                  }
                }
                else {
                  console.log("1b");
                  this.imageDisplay = "position:relative;height:100%;";
                  let lft: number = (w2 - this.windowWidth) / 2;
                  this.imageDisplay += "top:0px;left:-" + lft + "px;"
                }
              }
              else {
                console.log("2");
                let h3: number = (this.windowWidth / dimensions.width) * dimensions.height;
                this.imageDisplay = "position:relative;width:100%;";
                if (this.preferences.position == "CENTER") {
                  let tp: number = (h3 - this.windowHeight) / 2;
                  this.imageDisplay += "top:-" + tp + "px;left:0px;"
                }
                else {
                  this.imageDisplay += "top:0px;left:0px;"
                }
              }
            }
            else {
              if (this.windowHeight > h1) {
                console.log("4");
                let w2: number = (this.windowHeight / dimensions.width) * dimensions.height;

                if (w2 < this.windowWidth) {
                  console.log("4a");
                  let h2: number = (this.windowWidth / dimensions.height) * dimensions.width;

                  this.imageDisplay = "position:relative;width:100%;";
                  let tp: number = (h2 - this.windowHeight) / 2;
                  this.imageDisplay += "top:-" + tp + "px;left:0px;"
                }
                else {
                  //console.log("4b");
                  this.imageDisplay = "position:relative;height:100%;";
                  let lft: number = (w2 - this.windowWidth) / 2;
                  this.imageDisplay += "top:0px;left:-" + lft + "px;"
                }
              }
              else {
                //console.log("5");
                let h3: number = (this.windowWidth / dimensions.height) * dimensions.width;
                this.imageDisplay = "position:relative;width:100%;";
                let tp: number = (h3 - this.windowHeight) / 2;
                this.imageDisplay += "top:-" + tp + "px;left:0px;"
              }
            }
          }
        }
        else {

          console.log("6");
          if (dimensions.orientation == 1) {
            //LANDSCAPE
            let percent1: number = this.windowHeight / dimensions.height;
            let w2a: number = percent1 * dimensions.width;
            //let h2a: number = percent1 * dimensions.height;

            if (w2a > this.windowWidth) {
              console.log("6a");
              this.imageDisplay = "position:relative;height:100%;";
              if (dimensions.width == 0) {
                this.imageDisplay += "top:0px;"
                this.alignAdjustment = "text-align:center;"
              }
              else {
                let lft2: number = (w2a - this.windowWidth) / 2;
                this.imageDisplay += "top:0px;left:-" + lft2 + "px;"
              }
            }
            else {
              console.log("6b");
              this.imageDisplay = "position:relative;height:100%;";
              if (dimensions.width == 0) {
                this.imageDisplay += "top:0px;"
                this.alignAdjustment = "text-align:center;"
              }
              else {
                let lft2: number = (this.windowWidth - w2a) / 2;
                this.imageDisplay += "top:0px;left:" + lft2 + "px;"
              }
            }
          }
          else {
            console.log("7");
            //PORTRAIT
            let percent2: number = this.windowHeight / dimensions.width;

            let w2b: number = percent2 * dimensions.height;
            //let h2b: number = percent2 * dimensions.width;

            if (w2b > this.windowWidth) {
              console.log("7a");
              this.imageDisplay = "position:relative;height:100%;";
              let lft2: number = (w2b - this.windowWidth) / 2;
              this.imageDisplay += "top:0px;left:-" + lft2 + "0px;"
            }
            else {
              console.log("7b");
              this.imageDisplay = "position:relative;height:100%;";
              let lft2: number = (this.windowWidth - w2b) / 2;
              this.imageDisplay += "top:0px;left:" + lft2 + "0px;"
            }
          }
        }

        this.ref.detectChanges();
      });
    });
  }

  public updateWindowSize() {
    this.windowWidth = window.innerWidth;
    this.windowHeight = window.innerHeight;
    //console.log(`Window size: ${this.windowWidth} x ${this.windowHeight}`);

    this.positionImage();
  }
  public redrawImage(): void {
    this.positionImage();
  }
  public play(): void {
    this.start();
    this.ref.detectChanges();
  }
  public pause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused == true) {
      //console.log('Paused')
      this.stopTimer();
    }
    else {
      //console.log('Unpaused')
      this.start();
    }
    this.ref.detectChanges();
  }

  public removeFile(file: PlayListItem): void {
    let idx: number = -1;
    for (let i = 0; i < this.preferences.playlist.length; i++) {
      if (this.preferences.playlist[i] === file) {
        idx = i;
      }
    }
    if (idx != -1) {
      this.preferences.playlist.splice(idx, 1);
    }
  }
  public lastPage(): boolean {
    let hide: boolean = false;

    let max: number = (this.playStart + 1) * 30;
    if (max > this.preferences.playlist.length) {
      max = this.preferences.playlist.length;
    }
    if (max == this.preferences.playlist.length) {
      hide = true;
    }
    return hide;
  }
  public previousPage(): void {
    this.playStart -= 1;
    this.updatePrintList();
  }
  public nextPage(): void {
    this.playStart += 1;
    this.updatePrintList();
  }
  private updatePrintList() {
    this.printList = [];
    let max: number = (this.playStart + 1) * 30;

    if (this.preferences.playlist.length < 30) {
      max = this.preferences.playlist.length;
    }
    if (max > this.preferences.playlist.length) {
      max = this.preferences.playlist.length;
    }

    for (let i = (this.playStart * 30); i < max; i++) {
      this.printList.push(this.preferences.playlist[i]);
    }

    this.ref.detectChanges();
  }

  public resetTimer = () => {
    this.showCursor();
    clearTimeout(this.cursorTimer);
    this.cursorTimer = setTimeout(this.hideCursor, this.cursorTimerDuration);
  }
  public hideCursor = () => {
    document.body.style.cursor = 'none';
  }
  public showCursor = () => {
    document.body.style.cursor = 'default';
  };
}
