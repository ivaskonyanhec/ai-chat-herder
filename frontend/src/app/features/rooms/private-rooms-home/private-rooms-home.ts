import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';

@Component({
  selector: 'app-private-rooms-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './private-rooms-home.html',
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class PrivateRoomsHomeComponent implements OnInit {
  private readonly roomsApi = inject(RoomsApiService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly privateRooms = signal<RoomDto[]>([]);

  ngOnInit(): void {
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => {
        this.privateRooms.set(rooms.filter(r => r.visibility === 'Private'));
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load private rooms.');
        this.isLoading.set(false);
      },
    });
  }
}
