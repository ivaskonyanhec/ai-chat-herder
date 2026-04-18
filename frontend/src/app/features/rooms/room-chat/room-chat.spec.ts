import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomChatComponent } from './room-chat';

describe('RoomChatComponent', () => {
  let component: RoomChatComponent;
  let fixture: ComponentFixture<RoomChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
