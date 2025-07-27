import { Component, OnInit, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';

import { shell, IpcRenderer } from 'electron';
import { readdir, stat } from 'fs';
import { resolve } from 'path';

import { Prefereneces, DirectoryEntry, DirectoryGroup, PlayListItem } from '../cls/index';
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

  public newGroup: string = "";

  constructor(
            private router: Router,
            private ref: ChangeDetectorRef,
            private prefService: PreferenceService) {
    this.prefService.getPreferences$.subscribe(pref => this.setPreferences(pref));
  }

  ngOnInit() {
    this.preferences.directories.push(new DirectoryEntry());
  }

  public setPreferences(pref: Prefereneces): void {
    this.preferences = pref;
  }
  public selectDirectory(directory: DirectoryEntry, group: DirectoryGroup) {
    let isNew = false;
    if ((directory.path == null) || (directory.path == "")) {
      isNew = true;
    }
    //this.ipcRenderer.send("message", "Hello from Angular!")

    //return ipcRenderer.invoke('open-file-dialog');
    //shell.openItem("C:\\e-Masque");

    this.ipcRenderer.invoke('open-directory-dialog').then(d => {
      let dir: string = d;
        if (group.directories.filter(p => p.path == dir).length == 0) {
          directory.path = dir;
          directory.include = true;
          //if (isNew == true) {
            group.directories.push(new DirectoryEntry());
          //}
        }
    });
    console.log(this.preferences);
  }

  public removeDirectory(directory: DirectoryEntry, group: DirectoryGroup) {
    let idx: number = -1;
    for (let i = 0; i < group.directories.length; i++) {
      if (group.directories[i] === directory) {
        idx = i;
      }
    }
    if (idx != -1) {
      group.directories.splice(idx, 1);
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
  public buildPlayList(grp: DirectoryGroup): void {
    this.preferences.playlist = [];
    this.preferences.currentGroup = grp.name;
    this.maxCount = 0;
    for (let i = 0; i < grp.directories.length; i++) {
      if ((grp.directories[i].path != null) && (grp.directories[i].path != "")) {
        this.addDirectoryFiles(grp.directories[i].path, grp.directories[i].include);
      }
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

  public addGroup(): void{
    if (this.newGroup != ""){
      if (this.preferences.groups.filter(p => p.name.toLowerCase() == this.newGroup.toLowerCase()).length == 0) {
        let nGroup: DirectoryGroup = new DirectoryGroup();
        nGroup.name = this.newGroup;
        nGroup.directories = [];
        let dir: DirectoryEntry = new DirectoryEntry();
        nGroup.directories.push(dir);
        this.preferences.groups.push(nGroup);
        this.newGroup = "";
      }
      else {
        //GROUP ALREADY EXISTS
      }
    }
  }
  public removeGroup(grp: DirectoryGroup): void {
    let idx: number = -1;
    for (let i = 0; i < this.preferences.groups.length; i++) {
      if (grp === this.preferences.groups[i]) {
        idx = i;
      }
    }
    if (idx != -1) {
      this.preferences.groups.splice(idx, 1);
    }
  }
}
