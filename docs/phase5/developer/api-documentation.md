# API Documentation - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** API Team
**Review Frequency:** Per Release

---

## Table of Contents

1. [API Overview](#api-overview)
2. [Authentication](#authentication)
3. [Base URL & Versioning](#base-url--versioning)
4. [Common Patterns](#common-patterns)
5. [Task Management API](#task-management-api)
6. [User Management API](#user-management-api)
7. [Handover API](#handover-api)
8. [EMR Verification API](#emr-verification-api)
9. [Analytics API](#analytics-api)
10. [Error Handling](#error-handling)
11. [Rate Limiting](#rate-limiting)
12. [Code Examples](#code-examples)

---

## API Overview

### Architecture

The EMR Integration Platform exposes a RESTful API with the following characteristics:

- **Protocol:** HTTPS only (TLS 1.3)
- **Format:** JSON (application/json)
- **Authentication:** JWT with OAuth2.0
- **Versioning:** URI versioning (/api/v1/)
- **Rate Limiting:** 1000 requests/minute per user
- **Pagination:** Cursor-based pagination
- **Filtering:** Query parameter-based filtering
- **Sorting:** Multi-field sorting support

### API Endpoints Summary

| Service | Base Path | Purpose |
|---------|-----------|---------|
| Tasks | `/api/v1/tasks` | Task CRUD and management |
| Users | `/api/v1/users` | User and role management |
| Handovers | `/api/v1/handovers` | Shift handover operations |
| EMR | `/api/v1/emr` | EMR verification and integration |
| Analytics | `/api/v1/analytics` | Reports and metrics |
| Audit Logs | `/api/v1/audit-logs` | Compliance audit trail |

### OpenAPI Specification

Full OpenAPI 3.0 specification available at:
- **Development:** https://api-dev.emrtask.com/docs
- **Staging:** https://api-staging.emrtask.com/docs
- **Production:** https://api.emrtask.com/docs

---

## Authentication

### OAuth 2.0 + JWT Flow

#### 1. Obtain Access Token

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "nurse@hospital.com",
  "password": "SecurePassword123!",
  "mfa_code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "nurse@hospital.com",
      "role": "NURSE",
      "department_id": "650e8400-e29b-41d4-a716-446655440001"
    }
  }
}
```

#### 2. Use Access Token

```http
GET /api/v1/tasks
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 3. Refresh Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Multi-Factor Authentication (MFA)

#### Enable MFA

```http
POST /api/v1/auth/mfa/enable
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "backup_codes": [
      "a1b2c3d4",
      "e5f6g7h8"
    ]
  }
}
```

---

## Base URL & Versioning

### Environment URLs

| Environment | Base URL |
|-------------|----------|
| Development | https://api-dev.emrtask.com/api/v1 |
| Staging | https://api-staging.emrtask.com/api/v1 |
| Production | https://api.emrtask.com/api/v1 |

### API Versioning

- Current version: **v1**
- Version format: URI-based (`/api/v1/`)
- Deprecation notice: 6 months before EOL
- Support period: 12 months after new version release

---

## Common Patterns

### Request Headers

```http
Authorization: Bearer {access_token}
Content-Type: application/json
X-Request-ID: {uuid}
X-Department-ID: {department_uuid}
Accept: application/json
```

### Response Format

**Success Response:**

```json
{
  "success": true,
  "data": { /* response data */ },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-15T10:30:00Z"
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid task status",
    "details": [
      {
        "field": "status",
        "message": "Status must be one of: TO_DO, IN_PROGRESS, COMPLETED"
      }
    ]
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-15T10:30:00Z"
  }
}
```

### Pagination

**Request:**

```http
GET /api/v1/tasks?limit=20&cursor=eyJpZCI6IjU1MGU4NDAwIn0
```

**Response:**

```json
{
  "success": true,
  "data": [ /* tasks */ ],
  "pagination": {
    "next_cursor": "eyJpZCI6IjY1MGU4NDAwIn0",
    "prev_cursor": "eyJpZCI6IjQ1MGU4NDAwIn0",
    "has_more": true,
    "total": 150
  }
}
```

### Filtering

```http
GET /api/v1/tasks?status=TO_DO&priority=HIGH&assigned_to=550e8400-e29b-41d4-a716-446655440000
```

### Sorting

```http
GET /api/v1/tasks?sort=-priority,due_date
# - prefix means descending order
```

---

## Task Management API

### Create Task

```http
POST /api/v1/tasks
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "title": "Administer medication to patient in Room 302",
  "description": "Give 500mg acetaminophen at 2pm",
  "status": "TO_DO",
  "priority": "HIGH",
  "assigned_to": "550e8400-e29b-41d4-a716-446655440000",
  "department_id": "650e8400-e29b-41d4-a716-446655440001",
  "shift_id": "750e8400-e29b-41d4-a716-446655440002",
  "due_date": "2025-11-15T14:00:00Z",
  "requires_verification": true,
  "emr_system": "EPIC",
  "patient_id": "P12345",
  "emr_data": {
    "medication_order_id": "MO-789",
    "patient_mrn": "12345678",
    "medication_name": "Acetaminophen",
    "dosage": "500mg",
    "route": "PO"
  }
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "id": "850e8400-e29b-41d4-a716-446655440003",
    "title": "Administer medication to patient in Room 302",
    "description": "Give 500mg acetaminophen at 2pm",
    "status": "TO_DO",
    "priority": "HIGH",
    "assigned_to": "550e8400-e29b-41d4-a716-446655440000",
    "created_by": "550e8400-e29b-41d4-a716-446655440000",
    "department_id": "650e8400-e29b-41d4-a716-446655440001",
    "shift_id": "750e8400-e29b-41d4-a716-446655440002",
    "due_date": "2025-11-15T14:00:00Z",
    "requires_verification": true,
    "emr_system": "EPIC",
    "patient_id": "P12345",
    "emr_data": { /* emr data */ },
    "vector_clock": 1,
    "version": 1,
    "created_at": "2025-11-15T10:30:00Z",
    "updated_at": "2025-11-15T10:30:00Z"
  }
}
```

### Get Task by ID

```http
GET /api/v1/tasks/{task_id}
Authorization: Bearer {access_token}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "850e8400-e29b-41d4-a716-446655440003",
    "title": "Administer medication to patient in Room 302",
    "status": "IN_PROGRESS",
    "assigned_user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "nurse@hospital.com",
      "role": "NURSE"
    },
    "emr_verification": {
      "status": "VERIFIED",
      "verified_at": "2025-11-15T13:55:00Z",
      "verified_by": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

### Update Task

```http
PUT /api/v1/tasks/{task_id}
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "status": "COMPLETED",
  "notes": "Medication administered successfully"
}
```

### List Tasks

```http
GET /api/v1/tasks?status=TO_DO&priority=HIGH&limit=20
Authorization: Bearer {access_token}
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | enum | Filter by status: TO_DO, IN_PROGRESS, COMPLETED, BLOCKED |
| `priority` | enum | Filter by priority: LOW, MEDIUM, HIGH, CRITICAL |
| `assigned_to` | uuid | Filter by assigned user ID |
| `department_id` | uuid | Filter by department |
| `shift_id` | uuid | Filter by shift |
| `due_date_from` | datetime | Tasks due after this date |
| `due_date_to` | datetime | Tasks due before this date |
| `limit` | integer | Page size (default: 20, max: 100) |
| `cursor` | string | Pagination cursor |
| `sort` | string | Sort fields (e.g., -priority,due_date) |

### Verify Task with EMR

```http
POST /api/v1/tasks/{task_id}/verify
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "barcode_data": "MRN:12345678|ORDER:MO-789",
  "verification_method": "BARCODE_SCAN"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "verification_id": "950e8400-e29b-41d4-a716-446655440004",
    "status": "VERIFIED",
    "verified_at": "2025-11-15T13:55:00Z",
    "emr_response": {
      "patient_match": true,
      "order_match": true,
      "patient_name": "John Doe",
      "room_number": "302"
    }
  }
}
```

---

## User Management API

### Create User

```http
POST /api/v1/users
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "username": "doctor@hospital.com",
  "email": "doctor@hospital.com",
  "role": "DOCTOR",
  "department_id": "650e8400-e29b-41d4-a716-446655440001",
  "password": "SecurePassword123!"
}
```

### Get User

```http
GET /api/v1/users/{user_id}
Authorization: Bearer {access_token}
```

### Update User

```http
PUT /api/v1/users/{user_id}
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "role": "SUPERVISOR",
  "is_active": true
}
```

### List Users

```http
GET /api/v1/users?role=NURSE&department_id=650e8400-e29b-41d4-a716-446655440001
Authorization: Bearer {access_token}
```

---

## Handover API

### Create Handover

```http
POST /api/v1/handovers
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "from_shift_id": "750e8400-e29b-41d4-a716-446655440002",
  "to_shift_id": "850e8400-e29b-41d4-a716-446655440003",
  "task_summary": {
    "total_tasks": 25,
    "completed": 20,
    "pending": 5,
    "critical": 2
  },
  "critical_events": [
    {
      "type": "PATIENT_DETERIORATION",
      "patient_id": "P12345",
      "description": "Patient in Room 302 BP elevated",
      "action_taken": "Notified physician, medication adjusted"
    }
  ],
  "notes": "All medication rounds completed on time"
}
```

### Get Handover

```http
GET /api/v1/handovers/{handover_id}
Authorization: Bearer {access_token}
```

### Complete Handover

```http
POST /api/v1/handovers/{handover_id}/complete
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "acceptance_notes": "All information received and understood"
}
```

---

## EMR Verification API

### Verify Patient

```http
POST /api/v1/emr/verify/patient
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "patient_id": "P12345",
  "emr_system": "EPIC",
  "verification_data": {
    "mrn": "12345678",
    "date_of_birth": "1980-05-15"
  }
}
```

### Verify Order

```http
POST /api/v1/emr/verify/order
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "order_id": "MO-789",
  "patient_id": "P12345",
  "emr_system": "EPIC"
}
```

---

## Analytics API

### Get Dashboard Metrics

```http
GET /api/v1/analytics/dashboard?department_id=650e8400-e29b-41d4-a716-446655440001&date_from=2025-11-01&date_to=2025-11-15
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "task_completion_rate": 94.5,
    "average_completion_time_minutes": 45,
    "total_tasks": 1250,
    "completed_tasks": 1181,
    "overdue_tasks": 23,
    "verification_success_rate": 99.2,
    "emr_integration_uptime": 99.95
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request successful, no content returned |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `AUTHENTICATION_ERROR` | Authentication failed |
| `AUTHORIZATION_ERROR` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `EMR_VERIFICATION_FAILED` | EMR verification failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Internal server error |

---

## Rate Limiting

### Limits

- **Standard Users:** 1000 requests/minute
- **Admin Users:** 5000 requests/minute
- **Service Accounts:** 10000 requests/minute

### Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1700049600
```

### Exceeding Rate Limit

**Response (429 Too Many Requests):**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "retry_after": 60
  }
}
```

---

## Code Examples

### cURL

```bash
# Create task
curl -X POST https://api.emrtask.com/api/v1/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Administer medication",
    "status": "TO_DO",
    "priority": "HIGH",
    "patient_id": "P12345",
    "emr_system": "EPIC"
  }'
```

### JavaScript (Axios)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.emrtask.com/api/v1',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

// Create task
const createTask = async (taskData) => {
  try {
    const response = await api.post('/tasks', taskData);
    return response.data;
  } catch (error) {
    console.error('Error creating task:', error.response.data);
    throw error;
  }
};

// Get tasks
const getTasks = async (filters = {}) => {
  const response = await api.get('/tasks', { params: filters });
  return response.data;
};
```

### Python (requests)

```python
import requests

BASE_URL = "https://api.emrtask.com/api/v1"
ACCESS_TOKEN = "your_access_token"

headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json"
}

# Create task
def create_task(task_data):
    response = requests.post(
        f"{BASE_URL}/tasks",
        headers=headers,
        json=task_data
    )
    return response.json()

# Get tasks
def get_tasks(filters=None):
    response = requests.get(
        f"{BASE_URL}/tasks",
        headers=headers,
        params=filters
    )
    return response.json()
```

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial API documentation | API Team |

---

## Related Documentation

- [Development Setup](./development-setup.md)
- [Database Schema](./database-schema.md)
- [Testing Guide](./testing-guide.md)
- [System Architecture](/home/user/emr-integration-platform--4v4v54/docs/phase5/SYSTEM_ARCHITECTURE.md)

---

*For API support, contact api-team@emrtask.com or visit https://api-docs.emrtask.com*
