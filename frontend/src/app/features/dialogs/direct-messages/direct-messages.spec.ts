import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DirectMessagesComponent } from './direct-messages';

describe('DirectMessagesComponent', () => {
  let component: DirectMessagesComponent;
  let fixture: ComponentFixture<DirectMessagesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirectMessagesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DirectMessagesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no selected dialog', () => {
    expect(component.selectedDialog()).toBeNull();
  });

  it('should start loading dialogs', () => {
    expect(component.isLoadingDialogs()).toBe(true);
  });
});
