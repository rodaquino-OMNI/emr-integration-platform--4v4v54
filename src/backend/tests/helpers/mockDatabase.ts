import { jest } from '@jest/globals';

export class MockDatabase {
  private store: Map<string, any> = new Map();

  async connect(): Promise<void> {
    // Mock connection
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }

  async query(sql: string, params?: any[]): Promise<any> {
    // Mock query execution
    return { rows: [], rowCount: 0 };
  }

  async findOne(table: string, id: string): Promise<any> {
    const key = `${table}:${id}`;
    return this.store.get(key) || null;
  }

  async findMany(table: string, filters?: any): Promise<any[]> {
    const results: any[] = [];
    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(`${table}:`)) {
        results.push(value);
      }
    }
    return results;
  }

  async insert(table: string, data: any): Promise<any> {
    const id = data.id || this.generateId();
    const key = `${table}:${id}`;
    const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
    this.store.set(key, record);
    return record;
  }

  async update(table: string, id: string, data: any): Promise<any> {
    const key = `${table}:${id}`;
    const existing = this.store.get(key);
    if (!existing) {
      throw new Error('Record not found');
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(key, updated);
    return updated;
  }

  async delete(table: string, id: string): Promise<boolean> {
    const key = `${table}:${id}`;
    return this.store.delete(key);
  }

  async transaction(callback: () => Promise<any>): Promise<any> {
    // Mock transaction
    return await callback();
  }

  private generateId(): string {
    return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  clear(): void {
    this.store.clear();
  }
}

export const createMockDatabase = (): MockDatabase => {
  return new MockDatabase();
};
