import { jest } from '@jest/globals';

export class MockRedis {
  private store: Map<string, string> = new Map();
  private expirations: Map<string, number> = new Map();

  async get(key: string): Promise<string | null> {
    this.checkExpiration(key);
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
    this.store.set(key, value);
    if (options?.EX) {
      this.expirations.set(key, Date.now() + options.EX * 1000);
    }
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.expirations.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    this.checkExpiration(key);
    return this.store.has(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.checkExpiration(key);
        if (this.store.has(key)) {
          keys.push(key);
        }
      }
    }
    return keys;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) {
      return 0;
    }
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const expiration = this.expirations.get(key);
    if (!expiration) {
      return -1; // No expiration
    }
    const ttl = Math.floor((expiration - Date.now()) / 1000);
    return ttl > 0 ? ttl : -2; // -2 means expired
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0', 10);
    const incremented = current + 1;
    this.store.set(key, incremented.toString());
    return incremented;
  }

  async decr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0', 10);
    const decremented = current - 1;
    this.store.set(key, decremented.toString());
    return decremented;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const hash = JSON.parse(this.store.get(key) || '{}');
    const isNew = !hash.hasOwnProperty(field);
    hash[field] = value;
    this.store.set(key, JSON.stringify(hash));
    return isNew ? 1 : 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = JSON.parse(this.store.get(key) || '{}');
    return hash[field] || null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return JSON.parse(this.store.get(key) || '{}');
  }

  private checkExpiration(key: string): void {
    const expiration = this.expirations.get(key);
    if (expiration && Date.now() > expiration) {
      this.store.delete(key);
      this.expirations.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.expirations.clear();
  }

  async flushall(): Promise<void> {
    this.clear();
  }
}

export const createMockRedis = (): MockRedis => {
  return new MockRedis();
};
