import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlatformBansComponent } from './platform-bans';

describe('PlatformBansComponent', () => {
  let component: PlatformBansComponent;
  let fixture: ComponentFixture<PlatformBansComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBansComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlatformBansComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
