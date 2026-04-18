import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { AuthenticationPageComponent } from './features/auth/authentication-page.component';
import { WorkspaceShellComponent } from './features/workspace/workspace-shell.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth',
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    component: AuthenticationPageComponent,
  },
  {
    path: 'app',
    canActivate: [authGuard],
    component: WorkspaceShellComponent,
  },
  {
    path: '**',
    redirectTo: 'auth',
  },
];
