/**
 * WebSocket Real-time Updates Performance Test Suite
 *
 * Tests WebSocket real-time update performance for task and handover notifications
 * PRD Reference: Lines 269-285 (F5 - Notifications)
 *
 * Reference: /documentation/Product Requirements Document (PRD).md lines 269-285
 */

import { check, group, sleep } from 'k6';
import ws from 'k6/ws';
import { Counter, Rate, Trend } from 'k6/metrics';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generateTask,
  generateCorrelationId,
  websocketLatency
} from '../utils/helpers.js';

// Custom metrics
const wsConnectionTime = new Trend('ws_connection_time');
const wsMessageLatency = new Trend('ws_message_latency');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectionErrors = new Counter('ws_connection_errors');
const wsMessageErrors = new Rate('ws_message_errors');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 WebSocket connections
    { duration: '3m', target: 500 },   // Ramp up to 500 connections
    { duration: '5m', target: 500 },   // Sustain 500 concurrent connections
    { duration: '1m', target: 0 }      // Ramp down
  ],
  thresholds: {
    'ws_connection_time': ['p(95)<1000'],
    'ws_message_latency': ['p(95)<200'], // Real-time requirement
    'websocket_latency': ['p(95)<200'],
    'ws_message_errors': ['rate<0.001'],
    'ws_connection_errors': ['count<10']
  },
  tags: {
    test: 'websocket-realtime-performance',
    phase: 'phase5'
  }
};

const env = getEnvironment();

// Setup function
export function setup() {
  const token = authenticate(env.apiGateway, config.auth.testUsers[0]);
  return { token: token };
}

// Main test function
export default function(data) {
  const authToken = data.token;
  const wsUrl = `${env.websocketUrl}?token=${authToken}`;
  const correlationId = generateCorrelationId();

  group('WebSocket Real-time Updates', () => {
    const startConnectionTime = Date.now();

    const res = ws.connect(wsUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'x-correlation-id': correlationId
      },
      tags: { name: 'websocket-connection' }
    }, function (socket) {
      // Connection established
      const connectionDuration = Date.now() - startConnectionTime;
      wsConnectionTime.add(connectionDuration);

      socket.on('open', () => {
        console.log(`WebSocket connected (VU ${__VU})`);

        // Subscribe to real-time updates
        socket.send(JSON.stringify({
          type: 'subscribe',
          channels: ['tasks', 'handovers', 'notifications'],
          userId: `user-${__VU}`
        }));

        check(socket, {
          'WebSocket connected': () => true,
          'connection time < 1s': () => connectionDuration < 1000
        });
      });

      socket.on('message', (message) => {
        const receiveTime = Date.now();
        wsMessagesReceived.add(1);

        try {
          const data = JSON.parse(message);
          const sendTime = data.timestamp || Date.now();
          const latency = receiveTime - sendTime;

          wsMessageLatency.add(latency);
          websocketLatency.add(latency);

          check(data, {
            'message has type': (d) => d.type !== undefined,
            'message has data': (d) => d.data !== undefined,
            'message latency < 200ms': () => latency < 200,
            'message has timestamp': (d) => d.timestamp !== undefined
          });

          // Handle different message types
          switch (data.type) {
            case 'task_created':
              handleTaskCreated(socket, data);
              break;
            case 'task_updated':
              handleTaskUpdated(socket, data);
              break;
            case 'handover_initiated':
              handleHandoverInitiated(socket, data);
              break;
            case 'notification':
              handleNotification(socket, data);
              break;
            case 'error':
              wsMessageErrors.add(1);
              console.error('WebSocket error:', data.error);
              break;
            default:
              console.log('Unknown message type:', data.type);
          }

        } catch (error) {
          wsMessageErrors.add(1);
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      socket.on('error', (error) => {
        wsConnectionErrors.add(1);
        console.error('WebSocket error:', error);
      });

      socket.on('close', () => {
        console.log(`WebSocket closed (VU ${__VU})`);
      });

      // Simulate user actions that trigger real-time updates
      socket.setTimeout(() => {
        // Ping to keep connection alive
        socket.send(JSON.stringify({ type: 'ping' }));
      }, 5000);

      socket.setTimeout(() => {
        // Request task updates
        socket.send(JSON.stringify({
          type: 'get_updates',
          since: Date.now() - 60000 // Last minute
        }));
      }, 10000);

      socket.setTimeout(() => {
        // Simulate task status change
        socket.send(JSON.stringify({
          type: 'task_update',
          taskId: `task-${__VU}-${Date.now()}`,
          status: 'in_progress',
          timestamp: Date.now()
        }));
      }, 15000);

      // Keep connection open for test duration
      socket.setTimeout(() => {
        socket.close();
      }, 30000); // 30 seconds per connection
    });

    check(res, {
      'WebSocket connection established': (r) => r && r.status === 101
    });

    if (!res || res.status !== 101) {
      wsConnectionErrors.add(1);
    }
  });

  sleep(1);
}

// Message handlers
function handleTaskCreated(socket, data) {
  check(data, {
    'task created has taskId': (d) => d.data && d.data.taskId,
    'task created has patientId': (d) => d.data && d.data.patientId
  });

  // Acknowledge receipt
  socket.send(JSON.stringify({
    type: 'ack',
    messageId: data.messageId,
    timestamp: Date.now()
  }));
}

function handleTaskUpdated(socket, data) {
  check(data, {
    'task updated has taskId': (d) => d.data && d.data.taskId,
    'task updated has status': (d) => d.data && d.data.status
  });

  // Acknowledge receipt
  socket.send(JSON.stringify({
    type: 'ack',
    messageId: data.messageId,
    timestamp: Date.now()
  }));
}

function handleHandoverInitiated(socket, data) {
  check(data, {
    'handover has handoverId': (d) => d.data && d.data.handoverId,
    'handover has fromShift': (d) => d.data && d.data.fromShift,
    'handover has toShift': (d) => d.data && d.data.toShift
  });

  // Acknowledge receipt
  socket.send(JSON.stringify({
    type: 'ack',
    messageId: data.messageId,
    timestamp: Date.now()
  }));
}

function handleNotification(socket, data) {
  check(data, {
    'notification has message': (d) => d.data && d.data.message,
    'notification has priority': (d) => d.data && d.data.priority
  });

  // Acknowledge receipt
  socket.send(JSON.stringify({
    type: 'ack',
    messageId: data.messageId,
    timestamp: Date.now()
  }));
}

// Teardown function
export function teardown(data) {
  console.log('WebSocket Real-time Updates Performance Test Completed');
  console.log('Verify message latency p95 < 200ms for real-time updates');
}

// Handle summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/websocket-realtime-results.json': JSON.stringify(data, null, 2)
  };
}
