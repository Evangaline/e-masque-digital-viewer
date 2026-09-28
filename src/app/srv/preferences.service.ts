import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { Observable } from 'rxjs';

import { Prefereneces } from '../cls';
import { electronAPI } from './electron';

@Injectable({
  providedIn: 'root'
})
export class PreferenceService {

  //REPLAYS THE LATEST PREFERENCES SO COMPONENTS CREATED AFTER THE LOAD STILL RECEIVE THEM
  private preferencesSource = new ReplaySubject<Prefereneces>(1);

  getPreferences$: Observable<Prefereneces> = this.preferencesSource.asObservable();

  setPreferences(pref: Prefereneces) {
    this.applyTheme(pref.theme);
    this.preferencesSource.next(pref);
  }

  //SYSTEM FOLLOWS THE WINDOWS LIGHT/DARK SETTING, THE PAGE COLORS USE light-dark() SO color-scheme PICKS THE SIDE
  private applyTheme(theme: string): void {
    let scheme: string = 'light dark';
    if (theme == 'LIGHT') {
      scheme = 'light';
    } else if (theme == 'DARK') {
      scheme = 'dark';
    }
    document.documentElement.style.colorScheme = scheme;
    //MATCH THE WINDOW FRAME AND MENUS
    electronAPI().invoke('set-theme', theme || 'SYSTEM').catch(() => undefined);
  }
}
