import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UnreadService {
  private readonly _unreadCounts = signal<Map<string, number>>(new Map());

  readonly unreadCounts = this._unreadCounts.asReadonly();

  private key(contextType: string, contextId: string): string {
    return `${contextType}:${contextId}`;
  }

  setCount(contextType: string, contextId: string, count: number): void {
    const current = new Map(this._unreadCounts());
    const k = this.key(contextType, contextId);
    if (count === 0) {
      current.delete(k);
    } else {
      current.set(k, count);
    }
    this._unreadCounts.set(current);
  }

  getCount(contextType: string, contextId: string): number {
    return this._unreadCounts().get(this.key(contextType, contextId)) ?? 0;
  }

  clearAll(): void {
    this._unreadCounts.set(new Map());
  }
}
