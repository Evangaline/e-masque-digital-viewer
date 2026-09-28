import {
    Component,
    OnDestroy,
    ViewEncapsulation,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
    Prefereneces,
    DirectoryEntry,
    DirectoryGroup,
} from '../cls/index';
import { PreferenceService, PlaylistService, electronAPI } from '../srv/index';

//HOW LONG AFTER THE LAST CHANGE TO SAVE
const SAVE_DELAY: number = 400;
//HOW LONG THE "SAVED" INDICATOR STAYS UP
const SAVED_DISPLAY: number = 1800;

@Component({
    selector: 'app-settings',
    standalone: false,
    templateUrl: './settings.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    encapsulation: ViewEncapsulation.None,
})
export class SettingsComponent implements OnDestroy {
    private prefSubscription: Subscription | undefined;
    private saveTimer: any = null;
    private savedTimer: any = null;
    public isLoading: boolean = false;
    public justSaved: boolean = false;

    public preferences: Prefereneces = new Prefereneces();
    public newGroup: string = '';
    public groupError: string = '';

    constructor(
        private router: Router,
        private ref: ChangeDetectorRef,
        private prefService: PreferenceService,
        private playlistService: PlaylistService,
    ) {
        this.prefSubscription = this.prefService.getPreferences$.subscribe(
            (pref) => this.setPreferences(pref),
        );
    }

    ngOnDestroy() {
        this.prefSubscription?.unsubscribe();
        //SAVE ANYTHING STILL WAITING
        if (this.saveTimer != null) {
            clearTimeout(this.saveTimer);
            this.savePreferences();
        }
        clearTimeout(this.savedTimer);
    }

    public setPreferences(pref: Prefereneces): void {
        //PREFERENCES SAVED BEFORE THESE OPTIONS WERE ADDED
        if (pref.transition == null || pref.transition == '') {
            pref.transition = 'FADE';
        }
        if (pref.theme == null || pref.theme == '') {
            pref.theme = 'SYSTEM';
        }
        //OLDER VERSIONS KEPT AN EMPTY "BROWSE" ROW IN EACH GROUP
        (pref.groups || []).forEach((g) => {
            g.directories = (g.directories || []).filter(
                (d) => d.path != null && d.path != '',
            );
        });
        this.preferences = pref;
    }

    //CALLED ON EVERY CHANGE, SAVES SHORTLY AFTER THE LAST ONE
    public changed(): void {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.savePreferences();
        }, SAVE_DELAY);
    }
    private savePreferences(): void {
        electronAPI().invoke('save-file', JSON.stringify(this.preferences));
        this.prefService.setPreferences(this.preferences);
        this.justSaved = true;
        clearTimeout(this.savedTimer);
        this.savedTimer = setTimeout(() => {
            this.justSaved = false;
            this.ref.detectChanges();
        }, SAVED_DISPLAY);
        this.ref.detectChanges();
    }

    public back(): void {
        this.router.navigate(['/viewer']);
    }

    public addFolder(group: DirectoryGroup): void {
        electronAPI()
            .invoke('open-directory-dialog')
            .then((dir: string) => {
                if (dir != null && dir != '' && !group.directories.some((p) => p.path == dir)) {
                    let entry: DirectoryEntry = new DirectoryEntry();
                    entry.path = dir;
                    entry.include = true;
                    group.directories.push(entry);
                    this.changed();
                }
                this.ref.detectChanges();
            });
    }

    public removeDirectory(directory: DirectoryEntry, group: DirectoryGroup) {
        let idx: number = group.directories.indexOf(directory);
        if (idx != -1) {
            group.directories.splice(idx, 1);
            this.changed();
        }
    }

    //MAKES THE GROUP THE ACTIVE ONE AND BUILDS ITS PLAY LIST
    public buildPlayList(grp: DirectoryGroup): void {
        this.preferences.currentGroup = grp.name;
        this.isLoading = true;
        this.playlistService
            .buildPlaylist(
                grp.directories,
                this.preferences.orderby,
                this.preferences.direction,
            )
            .then((list) => {
                this.preferences.playlist = list;
                this.isLoading = false;
                this.savePreferences();
            })
            .catch((error) => {
                this.isLoading = false;
                console.log(error);
                this.ref.detectChanges();
            });
    }

    public addGroup(): void {
        let name: string = this.newGroup.trim();
        this.groupError = '';
        if (name == '') {
            return;
        }
        if (this.preferences.groups.some((p) => p.name.toLowerCase() == name.toLowerCase())) {
            this.groupError = 'A group called "' + name + '" already exists';
            return;
        }
        let nGroup: DirectoryGroup = new DirectoryGroup();
        nGroup.name = name;
        nGroup.directories = [];
        this.preferences.groups.push(nGroup);
        this.newGroup = '';
        this.changed();
    }
    public removeGroup(grp: DirectoryGroup): void {
        let idx: number = this.preferences.groups.indexOf(grp);
        if (idx != -1) {
            this.preferences.groups.splice(idx, 1);
            if (this.preferences.currentGroup == grp.name) {
                this.preferences.currentGroup = '';
            }
            this.changed();
        }
    }
}
