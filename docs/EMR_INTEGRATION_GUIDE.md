# EMR Integration Platform - Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Supported EMR Systems](#supported-emr-systems)
4. [HL7 v2 Integration](#hl7-v2-integration)
5. [FHIR R4 Integration](#fhir-r4-integration)
6. [OAuth2 Authentication](#oauth2-authentication)
7. [Data Transformation](#data-transformation)
8. [Configuration](#configuration)
9. [Testing with Sandboxes](#testing-with-sandboxes)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)

---

## Overview

The EMR Integration Platform provides a unified interface for integrating with multiple Electronic Medical Record (EMR) systems. It supports:

- **Epic** - FHIR R4 with OAuth2 (SMART-on-FHIR)
- **Cerner** - HL7 v2.x and FHIR R4
- **Generic FHIR** - Any FHIR R4 compliant system

### Key Features

- Production-grade HL7 v2 parser (supports versions 2.3, 2.4, 2.5, 2.5.1)
- FHIR R4 adapter with dynamic endpoint discovery
- OAuth2 token management with automatic refresh
- Unified Data Model (UDM) for normalized data representation
- Vendor-specific extension handling
- Circuit breaker for fault tolerance
- Automatic retry with exponential backoff
- Comprehensive error handling and validation

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   EMR Integration Platform                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐      │
│  │    Epic    │  │   Cerner   │  │  Generic FHIR    │      │
│  │  Adapter   │  │  Adapter   │  │    Adapter       │      │
│  └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘      │
│        │               │                   │                 │
│        └───────────────┴───────────────────┘                 │
│                        │                                     │
│        ┌───────────────┴──────────────┐                     │
│        │                               │                     │
│  ┌─────▼──────┐             ┌─────────▼────────┐           │
│  │ HL7 Parser │             │  FHIR Validator  │           │
│  └─────┬──────┘             └─────────┬────────┘           │
│        │                               │                     │
│        └───────────────┬───────────────┘                     │
│                        │                                     │
│             ┌──────────▼───────────┐                        │
│             │  Data Transformer    │                        │
│             │  (Vendor-Specific)   │                        │
│             └──────────┬───────────┘                        │
│                        │                                     │
│             ┌──────────▼───────────┐                        │
│             │  Unified Data Model  │                        │
│             │       (UDM)          │                        │
│             └──────────────────────┘                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────┐                                    ┌──────────┐
│  Client  │                                    │   EMR    │
│  System  │                                    │  Server  │
└────┬─────┘                                    └────┬─────┘
     │                                                │
     │  1. Request Access Token                      │
     ├──────────────────────────────────────────────►│
     │     (client_credentials grant)                │
     │                                                │
     │  2. Return Access Token                       │
     │◄──────────────────────────────────────────────┤
     │     (expires_in: 3600)                        │
     │                                                │
     │  3. API Request + Bearer Token                │
     ├──────────────────────────────────────────────►│
     │     Authorization: Bearer {token}             │
     │                                                │
     │  4. FHIR Resource Data                        │
     │◄──────────────────────────────────────────────┤
     │                                                │
     │  5. Token Refresh (before expiry)             │
     ├──────────────────────────────────────────────►│
     │                                                │
     │  6. New Access Token                          │
     │◄──────────────────────────────────────────────┤
     │                                                │
```

---

## Supported EMR Systems

### Epic (FHIR R4)

**Adapter:** `EpicAdapter`
**Protocol:** FHIR R4
**Authentication:** OAuth2 (SMART-on-FHIR)
**Base URL:** `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`

**Supported Resources:**
- Patient
- Task
- Observation
- Condition
- Medication
- MedicationRequest
- Encounter

### Cerner (HL7 v2 + FHIR R4)

**Adapter:** `CernerAdapter`
**Protocol:** HL7 v2.x, FHIR R4
**Authentication:** OAuth2
**Base URL:** `https://fhir.cerner.com/r4`

**Supported HL7 Message Types:**
- ADT (Admission, Discharge, Transfer)
- ORM (Order Message)
- ORU (Observation Result)

**Supported FHIR Resources:**
- Patient
- Task
- Observation

### Generic FHIR (Any R4 Compliant System)

**Adapter:** `GenericFHIRAdapter`
**Protocol:** FHIR R4
**Authentication:** OAuth2 or API Key
**Dynamic Discovery:** Yes (via CapabilityStatement)

**Features:**
- Automatic endpoint discovery
- Flexible authentication (OAuth2 or API Key)
- Support for any FHIR R4 resource
- Pagination handling
- Search parameter support

---

## HL7 v2 Integration

### HL7 Parser

The HL7 Parser (`hl7Parser.ts`) provides production-grade parsing for HL7 v2.x messages.

#### Supported Versions
- HL7 v2.3
- HL7 v2.4
- HL7 v2.5
- HL7 v2.5.1

#### Supported Message Types
- **ADT** - Admission, Discharge, Transfer
- **ORM** - Order Message
- **ORU** - Observation Result
- **SIU** - Scheduling Information
- **MDM** - Medical Document Management
- **DFT** - Detailed Financial Transaction
- **BAR** - Billing Account
- **ACK** - Acknowledgment

#### Supported Segments
- **MSH** - Message Header
- **PID** - Patient Identification
- **PV1** - Patient Visit
- **OBR** - Observation Request
- **OBX** - Observation/Result
- **EVN** - Event Type
- **NTE** - Notes and Comments

#### Usage Example

```typescript
import { HL7Parser } from '@emr-service/utils/hl7Parser';
import { EMR_SYSTEMS } from '@shared/types';

const parser = new HL7Parser({
  strictMode: true,
  validateChecksum: false,
  supportedVersions: ['2.3', '2.4', '2.5', '2.5.1'],
  allowCustomSegments: true
});

const rawHL7Message = `MSH|^~\\&|CERNER|HOSPITAL|EMR_SYSTEM|FACILITY|20231201120000||ADT^A01|MSG123|P|2.5.1
EVN|A01|20231201120000
PID|1||12345^^^MRN||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^STATE^12345||555-1234|||M|NON|12345
PV1|1|I|ICU^101^A|||1234^SMITH^JANE^A^^^MD|5678^JONES^ROBERT^^^MD||MED||||ADM|||1234^SMITH^JANE^A^^^MD|IP|12345|||||||||||||||||||||||20231201120000`;

const parsedMessage = parser.parse(rawHL7Message, EMR_SYSTEMS.CERNER);

console.log(parsedMessage.messageType); // "ADT"
console.log(parsedMessage.patientId);   // "12345"
console.log(parsedMessage.segments.length); // 4
```

#### Field Parsing

The parser supports parsing of:
- **Fields** - separated by `|`
- **Components** - separated by `^`
- **Subcomponents** - separated by `&`
- **Repetitions** - separated by `~`
- **Escape sequences** - `\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\Xnn\`

```typescript
const field = parser.parseField('DOE^JOHN^A^JR^DR^^L');
console.log(field.components); // ['DOE', 'JOHN', 'A', 'JR', 'DR', '', 'L']
```

---

## FHIR R4 Integration

### Generic FHIR Adapter

The Generic FHIR Adapter supports any FHIR R4 compliant system.

#### Initialization

```typescript
import { GenericFHIRAdapter } from '@emr-service/adapters/generic.adapter';

const adapter = new GenericFHIRAdapter({
  baseUrl: 'https://fhir.example.com/r4',
  useOAuth2: true,
  oauth2Config: {
    tokenEndpoint: 'https://auth.example.com/oauth2/token',
    clientId: process.env.FHIR_CLIENT_ID,
    clientSecret: process.env.FHIR_CLIENT_SECRET,
    scope: 'system/*.read system/*.write'
  },
  timeout: 30000,
  retryAttempts: 3
});

// Initialize to fetch CapabilityStatement
await adapter.initialize();
```

#### Fetching Resources

```typescript
// Fetch patient by ID
const patientResponse = await adapter.fetchPatient('patient-123');

// Fetch any resource type
const observation = await adapter.fetchResource(
  FHIRResourceType.Observation,
  'obs-456'
);

// Search resources with parameters
const bundle = await adapter.searchResources(
  FHIRResourceType.Patient,
  {
    name: 'John Doe',
    birthdate: '1980-01-01',
    _count: 20
  }
);

// Fetch all pages
const allPatients = await adapter.fetchAllPages(
  FHIRResourceType.Patient,
  { active: true }
);
```

#### Supported Search Parameters

The adapter supports all standard FHIR search parameters:
- `_count` - Page size
- `_offset` - Pagination offset
- `_sort` - Sort results
- `_include` - Include related resources
- `_revinclude` - Reverse include
- Resource-specific parameters (e.g., `name`, `birthdate`, `status`)

---

## OAuth2 Authentication

### OAuth2 Token Manager

The OAuth2 Token Manager (`oauth2TokenManager.ts`) handles token acquisition, caching, and automatic refresh.

#### Features

- Token caching with expiry tracking
- Automatic token refresh (5 minutes before expiry)
- Retry logic with exponential backoff
- SMART-on-FHIR support
- Thread-safe token acquisition
- Multiple grant types support

#### Configuration

```typescript
import { OAuth2TokenManager, OAuth2Config } from '@shared/utils/oauth2TokenManager';

const tokenManager = new OAuth2TokenManager();

const config: OAuth2Config = {
  tokenEndpoint: 'https://auth.epic.com/oauth2/token',
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  scope: 'system/Patient.read system/Observation.read',
  grantType: 'client_credentials'
};

// Get access token (cached automatically)
const accessToken = await tokenManager.getAccessToken(config);

// Use token in API requests
const response = await axios.get('https://fhir.epic.com/api/FHIR/R4/Patient/123', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

#### SMART-on-FHIR Support

```typescript
import { SmartOnFhirConfig } from '@shared/utils/oauth2TokenManager';

const smartConfig: SmartOnFhirConfig = {
  tokenEndpoint: 'https://auth.epic.com/oauth2/token',
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  fhirBaseUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
  aud: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
  scope: 'patient/*.read launch/patient'
};

const token = await tokenManager.getSmartOnFhirToken(smartConfig);
```

#### Token Refresh

Tokens are automatically refreshed 5 minutes before expiry. Manual refresh:

```typescript
// Force refresh
const newToken = await tokenManager.getAccessToken(config, true);

// Refresh using refresh token
const refreshedToken = await tokenManager.refreshToken(
  config,
  existingRefreshToken
);

// Clear cached tokens
tokenManager.clearCachedToken(config);
tokenManager.clearAllCachedTokens();
```

---

## Data Transformation

### Unified Data Model (UDM)

The Data Transformer converts vendor-specific formats to a normalized Unified Data Model.

#### Vendor-Specific Transformations

**Epic FHIR:**
```typescript
import { transformFHIRToUDM } from '@emr-service/utils/dataTransformer';

const epicPatient = await epicAdapter.getPatient('patient-123');
const udmData = await transformFHIRToUDM(
  epicPatient.data,
  EMR_SYSTEMS.EPIC
);

// UDM includes Epic-specific fields
console.log(udmData.data.epicPatientId);
console.log(udmData.data.managingOrganization);
```

**Cerner HL7:**
```typescript
import { transformHL7ToUDM } from '@emr-service/utils/dataTransformer';

const hl7Message = await cernerAdapter.fetchHL7PatientData('patient-456');
const udmData = await transformHL7ToUDM(
  hl7Message,
  EMR_SYSTEMS.CERNER
);

// UDM normalized from HL7 segments
console.log(udmData.resourceType); // "Patient"
console.log(udmData.patientId);    // "patient-456"
```

**Generic FHIR:**
```typescript
const genericPatient = await genericAdapter.fetchPatient('patient-789');
const udmData = await genericAdapter.convertToUDM(
  genericPatient.data,
  FHIRResourceType.Patient
);
```

#### Normalization Features

- **Identifier Systems** - Normalized across vendors
- **Status Codes** - Mapped to standard FHIR values
- **References** - Converted to relative URLs
- **Extensions** - Vendor-specific extensions preserved
- **Code Displays** - Added for vendor-specific codes

---

## Configuration

### Environment Variables

```bash
# Epic FHIR Configuration
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
EPIC_TOKEN_ENDPOINT=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
EPIC_CLIENT_ID=your-epic-client-id
EPIC_CLIENT_SECRET=your-epic-client-secret
EPIC_OAUTH_SCOPE=system/*.read system/*.write

# Cerner Configuration
CERNER_FHIR_BASE_URL=https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
CERNER_HL7_HOST=cerner-hl7.hospital.com
CERNER_HL7_PORT=2575
CERNER_CLIENT_ID=your-cerner-client-id
CERNER_CLIENT_SECRET=your-cerner-client-secret

# Generic FHIR Configuration
GENERIC_FHIR_BASE_URL=https://your-fhir-server.com/r4
GENERIC_FHIR_CLIENT_ID=your-client-id
GENERIC_FHIR_CLIENT_SECRET=your-client-secret
GENERIC_FHIR_API_KEY=your-api-key (optional)
```

### Adapter Configuration Files

**FHIR Config** (`src/backend/packages/emr-service/src/config/fhir.config.ts`)
```typescript
export const fhirConfig: FHIRConfig = {
  version: '4.0.1',
  baseUrls: {
    [EMR_SYSTEMS.EPIC]: process.env.EPIC_FHIR_BASE_URL,
    [EMR_SYSTEMS.CERNER]: process.env.CERNER_FHIR_BASE_URL
  },
  endpoints: {
    [FHIRResourceType.Patient]: '/Patient',
    [FHIRResourceType.Task]: '/Task',
    [FHIRResourceType.Observation]: '/Observation'
  },
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};
```

**HL7 Config** (`src/backend/packages/emr-service/src/config/hl7.config.ts`)
```typescript
export const hl7Config: HL7Config = {
  version: '2.5.1',
  connections: {
    [EMR_SYSTEMS.CERNER]: {
      host: process.env.CERNER_HL7_HOST,
      port: parseInt(process.env.CERNER_HL7_PORT, 10),
      facility: 'MAIN_HOSPITAL',
      application: 'EMR_TASK_SYSTEM',
      keepAlive: true,
      timeout: 30000
    }
  },
  messageTypes: [HL7MessageType.ADT, HL7MessageType.ORU],
  encoding: HL7Encoding.UNICODE
};
```

---

## Testing with Sandboxes

### Epic Sandbox

**Sandbox URL:** `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`
**Documentation:** https://fhir.epic.com/

**Test Patient IDs:**
- `Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB`
- `eEY9Z1o7ygPfyKVlXHB1CQB`

**Example Request:**
```bash
# Get access token
curl -X POST https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Fetch patient
curl -X GET https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/Patient/Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Accept: application/fhir+json"
```

### Cerner Sandbox

**Sandbox URL:** `https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`
**Documentation:** https://fhir.cerner.com/

**Test Patient IDs:**
- `12724066`
- `12742400`

**Example Request:**
```bash
# Get access token
curl -X POST https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=system/Patient.read"

# Fetch patient
curl -X GET https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d/Patient/12724066 \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Accept: application/fhir+json"
```

---

## Error Handling

### Common Errors

**OAuth2 Errors:**
```typescript
try {
  const token = await tokenManager.getAccessToken(config);
} catch (error) {
  if (error.message.includes('401')) {
    // Invalid client credentials
    console.error('Invalid client ID or secret');
  } else if (error.message.includes('429')) {
    // Rate limited
    console.error('Rate limit exceeded, retry after delay');
  }
}
```

**HL7 Parsing Errors:**
```typescript
try {
  const message = parser.parse(rawHL7, EMR_SYSTEMS.CERNER);
} catch (error) {
  const errorData = JSON.parse(error.message.replace('HL7 Parsing Error: ', ''));

  switch (errorData.type) {
    case HL7ErrorType.INVALID_MESSAGE_TYPE:
      console.error('Invalid HL7 message type');
      break;
    case HL7ErrorType.MISSING_REQUIRED_FIELD:
      console.error('Missing required segment:', errorData.segment);
      break;
  }
}
```

**FHIR Errors:**
```typescript
try {
  const patient = await adapter.fetchPatient('patient-123');
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      console.error('Patient not found');
    } else if (error.response?.status === 403) {
      console.error('Insufficient permissions');
    }
  }
}
```

---

## Best Practices

### 1. Token Management

- **Cache tokens** - Let OAuth2TokenManager handle caching
- **Don't hardcode secrets** - Use environment variables
- **Monitor expiry** - Tokens auto-refresh 5 minutes before expiry
- **Handle refresh failures** - Implement retry logic

### 2. Data Validation

- **Validate before parsing** - Check message structure
- **Use strict mode** - Enable strict validation in production
- **Handle malformed data** - Gracefully handle parsing errors
- **Log validation errors** - Track data quality issues

### 3. Performance

- **Use pagination** - Don't fetch all resources at once
- **Cache frequently accessed data** - Implement application-level caching
- **Use connection pooling** - Reuse HTTP connections
- **Monitor performance** - Track response times and error rates

### 4. Security

- **Use HTTPS** - Always use secure connections
- **Validate certificates** - Don't disable SSL verification
- **Rotate credentials** - Regularly update client secrets
- **Audit access** - Log all EMR system access
- **Minimize scope** - Request only required permissions

### 5. Error Handling

- **Use circuit breakers** - Prevent cascade failures
- **Implement retry logic** - Handle transient failures
- **Log errors** - Comprehensive error logging
- **Monitor alerts** - Set up alerting for critical errors

### 6. Testing

- **Use sandboxes** - Test with Epic/Cerner sandbox environments
- **Mock responses** - Create mock adapters for unit tests
- **Integration tests** - Test with real sandbox data
- **Performance tests** - Load test before production

---

## Support

For questions or issues:
- **Documentation:** See inline code documentation
- **Issues:** Create GitHub issues for bugs
- **Security:** Report security issues privately

---

**Last Updated:** 2024-12-01
**Version:** 1.0.0
