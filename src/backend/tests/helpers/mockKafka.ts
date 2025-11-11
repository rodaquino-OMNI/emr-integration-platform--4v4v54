import { jest } from '@jest/globals';

export class MockKafkaProducer {
  private messages: Array<{ topic: string; messages: any[] }> = [];

  async connect(): Promise<void> {
    // Mock connection
  }

  async disconnect(): Promise<void> {
    this.messages = [];
  }

  async send({ topic, messages }: { topic: string; messages: any[] }): Promise<any> {
    this.messages.push({ topic, messages });
    return {
      topic,
      partition: 0,
      offset: this.messages.length - 1
    };
  }

  getMessages(topic?: string): any[] {
    if (topic) {
      return this.messages.filter(m => m.topic === topic).flatMap(m => m.messages);
    }
    return this.messages.flatMap(m => m.messages);
  }

  clear(): void {
    this.messages = [];
  }
}

export class MockKafkaConsumer {
  private handlers: Map<string, Function> = new Map();

  async connect(): Promise<void> {
    // Mock connection
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
  }

  async subscribe({ topics }: { topics: string[] }): Promise<void> {
    // Mock subscription
  }

  async run({ eachMessage }: { eachMessage: Function }): Promise<void> {
    // Store handler for testing
    this.handlers.set('eachMessage', eachMessage);
  }

  async simulateMessage(topic: string, message: any): Promise<void> {
    const handler = this.handlers.get('eachMessage');
    if (handler) {
      await handler({
        topic,
        partition: 0,
        message: {
          key: null,
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
          offset: '0'
        }
      });
    }
  }
}

export const createMockKafka = () => {
  return {
    producer: () => new MockKafkaProducer(),
    consumer: ({ groupId }: { groupId: string }) => new MockKafkaConsumer()
  };
};
