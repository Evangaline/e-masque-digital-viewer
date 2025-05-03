import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';

import { shell, IpcRenderer } from 'electron';
import { readdir, stat } from 'fs';
import { resolve } from 'path';

import { Prefereneces, DirectoryEntry, PlayListItem } from '../cls/index';
import { PreferenceService } from '../srv/index';

@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './settings.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class SettingsComponent {

  private ipcRenderer: IpcRenderer = (window as any).require('electron').ipcRenderer;
  public isLoading: boolean = false;

  //public dir: string = '';
  public preferences: Prefereneces = new Prefereneces();
  public color: any = "#ff0000";
  public maxCount: number = 0;

  constructor(
            private router: Router,
            private prefService: PreferenceService) {
    this.prefService.getPreferences$.subscribe(pref => this.preferences = pref);
  }

  ngOnInit() {
    this.preferences.directories.push(new DirectoryEntry());
  }

  public selectDirectory(directory: DirectoryEntry) {
    let isNew = false;
    if ((directory.path == null) || (directory.path == "")) {
      isNew = true;
    }
    //this.ipcRenderer.send("message", "Hello from Angular!")

    //return ipcRenderer.invoke('open-file-dialog');
    //shell.openItem("C:\\e-Masque");

    this.ipcRenderer.invoke('open-directory-dialog').then(d => {
      let dir: string = d;
        if (this.preferences.directories.filter(p => p.path == dir).length == 0) {
          directory.path = dir;
          directory.include = true;
          if (isNew == true) {
            this.preferences.directories.push(new DirectoryEntry());
          }
        }
    });
  }

  public removeDirectory(directory: DirectoryEntry) {
    let idx: number = -1;
    for (let i = 0; i < this.preferences.directories.length; i++) {
      if (this.preferences.directories[i] === directory) {
        idx = i;
      }
    }
    if (idx != -1) {
      this.preferences.directories.splice(idx, 1);
    }
  }

  public saveSettings(): void {
    if ((this.preferences.directories != null) && (this.preferences.directories.length > 0)) {
      this.isLoading = true;
      if ((this.preferences.playlist == null) || (this.preferences.playlist.length == 0)) {
        this.preferences.playlist = [];
        this.maxCount = 0;
        for (let i = 0; i < this.preferences.directories.length; i++) {
          if ((this.preferences.directories[i].path != null) && (this.preferences.directories[i].path != "")) {
            this.addDirectoryFiles(this.preferences.directories[i].path, this.preferences.directories[i].include);
          }
        }
      }
      else {
        this.ipcRenderer.invoke("save-file", JSON.stringify(this.preferences));
        this.prefService.setPreferences(this.preferences);
      }
      this.isLoading = false;
    }
  }
  public reBuildPlayList() {
    this.preferences.playlist = [];
    this.maxCount = 0;
    for (let i = 0; i < this.preferences.directories.length; i++) {
      if ((this.preferences.directories[i].path != null) && (this.preferences.directories[i].path != "")) {
        this.addDirectoryFiles(this.preferences.directories[i].path, this.preferences.directories[i].include);
      }
    }
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

}
