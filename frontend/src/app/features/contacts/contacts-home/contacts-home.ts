import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-contacts-home',
  standalone: true,
  imports: [],
  templateUrl: './contacts-home.html',
  styleUrl: './contacts-home.scss',
})
export class ContactsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
