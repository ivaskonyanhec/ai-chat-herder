import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageRoomComponent } from './manage-room';

describe('ManageRoomComponent', () => {
  let component: ManageRoomComponent;
  let fixture: ComponentFixture<ManageRoomComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageRoomComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageRoomComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
