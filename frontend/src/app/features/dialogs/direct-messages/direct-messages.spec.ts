import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DirectMessagesComponent } from './direct-messages';

describe('DirectMessagesComponent', () => {
  let component: DirectMessagesComponent;
  let fixture: ComponentFixture<DirectMessagesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirectMessagesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DirectMessagesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
