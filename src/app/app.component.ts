import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';

import { Prefereneces, DirectoryEntry, PlayListItem } from './cls/index';
import { PreferenceService, electronAPI } from './srv/index';

@Component({
    selector: 'app-root',
    standalone: false,
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./app.component.scss'],
})
export class AppComponent {
    title = 'E-MASQUE Interactive - Digital Picture';

    public preferences: Prefereneces = new Prefereneces();

    constructor(
        private router: Router,
        private prefService: PreferenceService,
    ) {
        electronAPI()
            .invoke('load-file')
            .then((d) => {
                let json: string = d;
                let loaded: Prefereneces | null = null;
                if (json != null && json != '') {
                    try {
                        loaded = JSON.parse(json);
                    } catch (error) {
                        //CORRUPT PREFERENCES FILE, FALL BACK TO THE DEFAULTS
                        console.log(error);
                    }
                }
                if (loaded != null) {
                    this.preferences = loaded;
                    this.prefService.setPreferences(this.preferences);
                } else {
                    electronAPI()
                        .invoke('default-directory')
                        .then((dd) => {
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

    ngOnInit() {}
}
