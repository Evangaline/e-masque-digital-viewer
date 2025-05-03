import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { IpcRenderer } from 'electron';

import { Prefereneces, DirectoryEntry, PlayListItem } from './cls/index';
import { PreferenceService } from './srv/index';

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: string) => void;
    }
  }
}

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'E-MASQUE Interactive - Digital Picture';

  private ipcRenderer: IpcRenderer = (window as any).require('electron').ipcRenderer;
  public preferences: Prefereneces = new Prefereneces();

  constructor(
    private router: Router,
    private prefService: PreferenceService) {

    this.ipcRenderer.invoke('load-file').then(d => {
      let json: string = d;
      if ((json != null) && (json != "")) {
        this.preferences = JSON.parse(json);
        this.prefService.setPreferences(this.preferences);
      }
      else {
        this.ipcRenderer.invoke('default-directory').then(dd => {
          this.preferences = new Prefereneces();
          this.preferences.playlist = [];

          let pItem: PlayListItem = new PlayListItem();
          pItem.path = dd;
          pItem.sequence = 0;

          this.preferences.playlist.push(pItem);
          this.prefService.setPreferences(this.preferences);
        });
      }
    });
  }

  ngOnInit() {
  }

}
