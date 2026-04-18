import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { AuthenticationPageComponent } from './features/auth/authentication-page.component';
import { RoomsHomeComponent } from './features/rooms/rooms-home.component';
import { RoomChatComponent } from './features/rooms/room-chat/room-chat';
import { WorkspaceShellComponent } from './features/workspace/workspace-shell.component';
import { SessionsPanelComponent } from './features/sessions/sessions-panel.component';
import { ProfileSettingsComponent } from './features/profile/profile-settings/profile-settings';
import { ContactsHomeComponent } from './features/contacts/contacts-home/contacts-home';
import { FriendRequestsComponent } from './features/contacts/friend-requests/friend-requests';
import { RoomInvitationsComponent } from './features/rooms/room-invitations/room-invitations';
import { PlatformBansComponent } from './features/admin/platform-bans/platform-bans';
import { ManageRoomComponent } from './features/rooms/manage-room/manage-room';
import { DirectMessagesComponent } from './features/dialogs/direct-messages/direct-messages';

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
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'rooms',
      },
      {
        path: 'rooms',
        component: RoomsHomeComponent,
      },
      {
        path: 'rooms/:id',
        component: RoomChatComponent,
      },
      {
        path: 'sessions',
        component: SessionsPanelComponent,
      },
      {
        path: 'settings',
        component: ProfileSettingsComponent,
      },
      {
        path: 'contacts',
        component: ContactsHomeComponent,
      },
      {
        path: 'requests',
        component: FriendRequestsComponent,
      },
      {
        path: 'invitations',
        component: RoomInvitationsComponent,
      },
      {
        path: 'messages/:id',
        component: DirectMessagesComponent,
      },
      {
        path: 'admin',
        component: PlatformBansComponent,
      },
      {
        path: 'rooms/:id/manage',
        component: ManageRoomComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'auth',
  },
];
