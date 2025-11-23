import { Redis } from 'ioredis';
import { EventPublisher } from './publisher.js';

let eventPublisher: EventPublisher | null = null;

export function initializeEventPublisher(redis: Redis): EventPublisher {
  if (!eventPublisher) {
    eventPublisher = new EventPublisher(redis);
  }
  return eventPublisher;
}

export function getEventPublisher(): EventPublisher {
  if (!eventPublisher) {
    throw new Error('Event publisher not initialized. Call initializeEventPublisher first.');
  }
  return eventPublisher;
}

export * from './types.js';
export * from './publisher.js';