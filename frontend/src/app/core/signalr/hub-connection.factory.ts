import { InjectionToken } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';

export type HubConnectionFactory = (
  url: string,
  getToken: () => string,
) => HubConnection;

export const HUB_CONNECTION_FACTORY = new InjectionToken<HubConnectionFactory>(
  'HUB_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: (): HubConnectionFactory =>
      (url, getToken) =>
        new HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: getToken })
          .withAutomaticReconnect()
          .build(),
  },
);
