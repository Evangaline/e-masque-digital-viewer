import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Observable } from 'rxjs';

import { Prefereneces } from '../cls';

@Injectable({
  providedIn: 'root'
})
export class PreferenceService {

  private preferencesSource = new Subject<Prefereneces>();

  getPreferences$: Observable<Prefereneces> = this.preferencesSource.asObservable();

  setPreferences(pref: Prefereneces) {
    this.preferencesSource.next(pref);
  }
}
