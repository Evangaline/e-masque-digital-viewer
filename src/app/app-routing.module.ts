import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { SettingsComponent, ViewerComponent } from './cmp/index';

const routes: Routes = [
  { path: '', redirectTo: 'viewer', pathMatch: 'full' },
  { path: 'viewer', component: ViewerComponent },
  { path: 'preferences', component: SettingsComponent },
  { path: '**', component: ViewerComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
