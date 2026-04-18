import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomInvitationsComponent } from './room-invitations';

describe('RoomInvitationsComponent', () => {
  let component: RoomInvitationsComponent;
  let fixture: ComponentFixture<RoomInvitationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomInvitationsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomInvitationsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
