import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContactsHomeComponent } from './contacts-home';

describe('ContactsHomeComponent', () => {
  let component: ContactsHomeComponent;
  let fixture: ComponentFixture<ContactsHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactsHomeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContactsHomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
