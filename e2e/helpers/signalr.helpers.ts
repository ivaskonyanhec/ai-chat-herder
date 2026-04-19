import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

export function hubUrl(path: string): string {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost';
  return new URL(path, baseUrl).toString();
}

export async function createHubConnection(path: string, accessToken: string): Promise<HubConnection> {
  const connection = new HubConnectionBuilder()
    .withUrl(hubUrl(path), { accessTokenFactory: () => accessToken })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Error)
    .build();

  await connection.start();
  return connection;
}

export function waitForHubEvent<T>(
  connection: HubConnection,
  eventName: string,
  predicate: (payload: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      connection.off(eventName, handler);
      resolve(payload);
    };

    connection.on(eventName, handler);
  });
}
