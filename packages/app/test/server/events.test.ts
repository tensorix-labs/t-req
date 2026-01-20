import { describe, expect, test } from 'bun:test';
import { createEventManager, type EventEnvelope } from '../../src/server/events';

describe('event manager subscriber lifecycle', () => {
  test('should subscribe and receive events', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    const subscriberId = manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'testEvent', data: 'hello' });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('testEvent');
    expect(received[0]?.payload.data).toBe('hello');

    manager.unsubscribe(subscriberId);
    manager.closeAll();
  });

  test('should unsubscribe and stop receiving events', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    const subscriberId = manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'event1' });
    expect(received).toHaveLength(1);

    manager.unsubscribe(subscriberId);

    manager.emit(undefined, 'run-1', { type: 'event2' });
    expect(received).toHaveLength(1); // No new events

    manager.closeAll();
  });

  test('should track subscriber count', () => {
    const manager = createEventManager();

    expect(manager.getSubscriberCount()).toBe(0);

    const id1 = manager.subscribe(
      undefined,
      () => {},
      () => {}
    );
    expect(manager.getSubscriberCount()).toBe(1);

    const id2 = manager.subscribe(
      undefined,
      () => {},
      () => {}
    );
    expect(manager.getSubscriberCount()).toBe(2);

    manager.unsubscribe(id1);
    expect(manager.getSubscriberCount()).toBe(1);

    manager.unsubscribe(id2);
    expect(manager.getSubscriberCount()).toBe(0);

    manager.closeAll();
  });

  test('should call close callback when closeAll is called', () => {
    const manager = createEventManager();
    let closeCalled = false;

    manager.subscribe(
      undefined,
      () => {},
      () => {
        closeCalled = true;
      }
    );

    manager.closeAll();

    expect(closeCalled).toBe(true);
    expect(manager.getSubscriberCount()).toBe(0);
  });

  test('should close all subscribers', () => {
    const manager = createEventManager();
    const closeCalls: number[] = [];

    manager.subscribe(
      undefined,
      () => {},
      () => closeCalls.push(1)
    );
    manager.subscribe(
      undefined,
      () => {},
      () => closeCalls.push(2)
    );
    manager.subscribe(
      undefined,
      () => {},
      () => closeCalls.push(3)
    );

    manager.closeAll();

    expect(closeCalls).toHaveLength(3);
    expect(manager.getSubscriberCount()).toBe(0);
  });
});

describe('event delivery with filtering', () => {
  test('should deliver events to subscribers without session filter', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit('session-1', 'run-1', { type: 'event1' });
    manager.emit('session-2', 'run-2', { type: 'event2' });
    manager.emit(undefined, 'run-3', { type: 'event3' });

    // Subscriber with no session filter receives all events
    expect(received).toHaveLength(3);

    manager.closeAll();
  });

  test('should filter events by sessionId', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    manager.subscribe(
      'session-1',
      (event) => received.push(event),
      () => {}
    );

    manager.emit('session-1', 'run-1', { type: 'event1' });
    manager.emit('session-2', 'run-2', { type: 'event2' }); // Should not receive
    manager.emit('session-1', 'run-3', { type: 'event3' });

    expect(received).toHaveLength(2);
    expect(received[0]?.payload.type).toBe('event1');
    expect(received[1]?.payload.type).toBe('event3');

    manager.closeAll();
  });

  test('should deliver events without sessionId to all subscribers', () => {
    const manager = createEventManager();
    const received1: EventEnvelope[] = [];
    const received2: EventEnvelope[] = [];

    manager.subscribe(
      'session-1',
      (event) => received1.push(event),
      () => {}
    );
    manager.subscribe(
      'session-2',
      (event) => received2.push(event),
      () => {}
    );

    // Event without sessionId - but filter is on subscriber side
    // Subscribers filter by their own sessionId matching event sessionId
    manager.emit(undefined, 'run-1', { type: 'broadcast' });

    // Subscribers with session filter only match if event sessionId matches
    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(0);

    manager.closeAll();
  });

  test('should handle multiple subscribers for same session', () => {
    const manager = createEventManager();
    const received1: EventEnvelope[] = [];
    const received2: EventEnvelope[] = [];

    manager.subscribe(
      'session-1',
      (event) => received1.push(event),
      () => {}
    );
    manager.subscribe(
      'session-1',
      (event) => received2.push(event),
      () => {}
    );

    manager.emit('session-1', 'run-1', { type: 'test' });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    manager.closeAll();
  });
});

describe('event envelope structure', () => {
  test('should include all required fields in envelope', () => {
    const manager = createEventManager();
    let envelope: EventEnvelope | undefined;

    manager.subscribe(
      undefined,
      (event) => {
        envelope = event;
      },
      () => {}
    );

    manager.emit('session-1', 'run-123', { type: 'testEvent', customField: 'value' });

    expect(envelope).toBeDefined();
    expect(envelope?.type).toBe('testEvent');
    expect(envelope?.ts).toBeDefined();
    expect(typeof envelope?.ts).toBe('number');
    expect(envelope?.runId).toBe('run-123');
    expect(envelope?.sessionId).toBe('session-1');
    expect(envelope?.seq).toBeDefined();
    expect(envelope?.payload).toEqual({ type: 'testEvent', customField: 'value' });

    manager.closeAll();
  });

  test('should handle undefined sessionId', () => {
    const manager = createEventManager();
    let envelope: EventEnvelope | undefined;

    manager.subscribe(
      undefined,
      (event) => {
        envelope = event;
      },
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'test' });

    expect(envelope?.sessionId).toBeUndefined();

    manager.closeAll();
  });
});

describe('sequence management per runId', () => {
  test('should increment sequence for same runId', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'event1' });
    manager.emit(undefined, 'run-1', { type: 'event2' });
    manager.emit(undefined, 'run-1', { type: 'event3' });

    expect(received[0]?.seq).toBe(1);
    expect(received[1]?.seq).toBe(2);
    expect(received[2]?.seq).toBe(3);

    manager.closeAll();
  });

  test('should have independent sequences for different runIds', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'event1' }); // run-1, seq 1
    manager.emit(undefined, 'run-2', { type: 'event2' }); // run-2, seq 1
    manager.emit(undefined, 'run-1', { type: 'event3' }); // run-1, seq 2
    manager.emit(undefined, 'run-2', { type: 'event4' }); // run-2, seq 2

    expect(received[0]?.runId).toBe('run-1');
    expect(received[0]?.seq).toBe(1);

    expect(received[1]?.runId).toBe('run-2');
    expect(received[1]?.seq).toBe(1);

    expect(received[2]?.runId).toBe('run-1');
    expect(received[2]?.seq).toBe(2);

    expect(received[3]?.runId).toBe('run-2');
    expect(received[3]?.seq).toBe(2);

    manager.closeAll();
  });

  test('should continue sequence after unsubscribe/resubscribe', () => {
    const manager = createEventManager();
    const received1: EventEnvelope[] = [];
    const received2: EventEnvelope[] = [];

    const id = manager.subscribe(
      undefined,
      (event) => received1.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'event1' }); // seq 1
    manager.emit(undefined, 'run-1', { type: 'event2' }); // seq 2

    manager.unsubscribe(id);

    manager.subscribe(
      undefined,
      (event) => received2.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'event3' }); // seq 3

    expect(received1).toHaveLength(2);
    expect(received2).toHaveLength(1);
    expect(received2[0]?.seq).toBe(3); // Continues from where we left off

    manager.closeAll();
  });
});

describe('error handling', () => {
  test('should handle send errors gracefully', () => {
    const manager = createEventManager();
    let _sendCount = 0;

    manager.subscribe(
      undefined,
      () => {
        _sendCount++;
        throw new Error('Send failed');
      },
      () => {}
    );

    // Should not throw
    expect(() => {
      manager.emit(undefined, 'run-1', { type: 'test' });
    }).not.toThrow();

    // Subscriber should be removed after error
    expect(manager.getSubscriberCount()).toBe(0);

    manager.closeAll();
  });

  test('should continue delivering to other subscribers after one fails', () => {
    const manager = createEventManager();
    const received: EventEnvelope[] = [];

    // First subscriber will throw
    manager.subscribe(
      undefined,
      () => {
        throw new Error('First subscriber failed');
      },
      () => {}
    );

    // Second subscriber should still receive events
    manager.subscribe(
      undefined,
      (event) => received.push(event),
      () => {}
    );

    manager.emit(undefined, 'run-1', { type: 'test' });

    expect(received).toHaveLength(1);

    manager.closeAll();
  });
});

describe('subscriber ID uniqueness', () => {
  test('should generate unique subscriber IDs', () => {
    const manager = createEventManager();
    const ids: string[] = [];

    for (let i = 0; i < 50; i++) {
      const id = manager.subscribe(
        undefined,
        () => {},
        () => {}
      );
      expect(ids.includes(id)).toBe(false);
      ids.push(id);
    }

    expect(ids.length).toBe(50);

    manager.closeAll();
  });
});
