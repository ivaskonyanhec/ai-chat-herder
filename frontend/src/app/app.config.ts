import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { authInterceptor } from './core/auth/auth.interceptor';
import { chatHerderPrimeNgPreset } from './core/ui/chatherder-primeng-preset';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    providePrimeNG({
      ripple: false,
      theme: {
        preset: chatHerderPrimeNgPreset,
        options: {
          darkModeSelector: false,
        },
      },
    }),
  ],
};
