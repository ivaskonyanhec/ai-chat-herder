import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ContactsHomeComponent } from './contacts-home';

describe('ContactsHomeComponent', () => {
  let component: ContactsHomeComponent;
  let fixture: ComponentFixture<ContactsHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactsHomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactsHomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.isLoading()).toBe(true);
  });
});
