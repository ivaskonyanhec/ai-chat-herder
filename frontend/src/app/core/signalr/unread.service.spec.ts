import { TestBed } from '@angular/core/testing';
import { UnreadService } from './unread.service';

describe('UnreadService', () => {
  let service: UnreadService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [UnreadService] });
    service = TestBed.inject(UnreadService);
  });

  it('starts with an empty unread map', () => {
    expect(service.unreadCounts().size).toBe(0);
  });

  it('setCount stores count under contextType:contextId key', () => {
    service.setCount('room', 'room-abc', 5);
    expect(service.unreadCounts().get('room:room-abc')).toBe(5);
  });

  it('setCount with 0 removes the key from the map', () => {
    service.setCount('room', 'room-abc', 3);
    service.setCount('room', 'room-abc', 0);
    expect(service.unreadCounts().has('room:room-abc')).toBe(false);
  });

  it('getCount returns 0 for unknown key', () => {
    expect(service.getCount('dialog', 'dialog-xyz')).toBe(0);
  });

  it('getCount returns stored count', () => {
    service.setCount('dialog', 'dialog-xyz', 7);
    expect(service.getCount('dialog', 'dialog-xyz')).toBe(7);
  });

  it('clearAll resets the map to empty', () => {
    service.setCount('room', 'r1', 2);
    service.setCount('dialog', 'd1', 1);
    service.clearAll();
    expect(service.unreadCounts().size).toBe(0);
  });
});
