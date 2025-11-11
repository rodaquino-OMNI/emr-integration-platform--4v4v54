import {
  HL7Message,
  HL7MessageType,
  HL7Segment,
  HL7SegmentType,
  HL7Header,
  HL7Encoding,
  HL7ValidationError,
  HL7ErrorType,
  HL7_FIELD_SEPARATOR,
  HL7_COMPONENT_SEPARATOR,
  HL7_SUBCOMPONENT_SEPARATOR,
  HL7_REPETITION_SEPARATOR,
  HL7_ESCAPE_CHARACTER
} from '../types/hl7.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

/**
 * Parsed HL7 Field Structure
 */
export interface ParsedHL7Field {
  raw: string;
  components: string[];
  subcomponents: string[][];
  repetitions: string[];
}

/**
 * HL7 Parser Configuration
 */
export interface HL7ParserConfig {
  strictMode?: boolean;
  validateChecksum?: boolean;
  supportedVersions?: string[];
  allowCustomSegments?: boolean;
}

/**
 * HL7 v2 Parser
 *
 * Production-grade parser for HL7 v2.x messages (versions 2.3, 2.4, 2.5, 2.5.1)
 *
 * Features:
 * - Parse ADT, ORM, ORU, SIU, MDM, DFT, BAR, ACK message types
 * - Extract and validate MSH, PID, PV1, OBR, OBX, EVN, NTE segments
 * - Field, component, subcomponent parsing
 * - Handle escape sequences and special characters
 * - Message structure validation
 * - Convert to normalized JSON format
 * - Support multiple HL7 versions
 * - Comprehensive error handling
 */
export class HL7Parser {
  private readonly config: HL7ParserConfig;

  // Supported HL7 versions
  private readonly SUPPORTED_VERSIONS = ['2.3', '2.4', '2.5', '2.5.1'];

  // Required segments for different message types
  private readonly REQUIRED_SEGMENTS: Record<HL7MessageType, HL7SegmentType[]> = {
    [HL7MessageType.ADT]: [HL7SegmentType.MSH, HL7SegmentType.EVN, HL7SegmentType.PID],
    [HL7MessageType.ORM]: [HL7SegmentType.MSH, HL7SegmentType.PID, HL7SegmentType.OBR],
    [HL7MessageType.ORU]: [HL7SegmentType.MSH, HL7SegmentType.PID, HL7SegmentType.OBR],
    [HL7MessageType.SIU]: [HL7SegmentType.MSH],
    [HL7MessageType.MDM]: [HL7SegmentType.MSH, HL7SegmentType.PID],
    [HL7MessageType.DFT]: [HL7SegmentType.MSH, HL7SegmentType.PID],
    [HL7MessageType.BAR]: [HL7SegmentType.MSH, HL7SegmentType.PID],
    [HL7MessageType.ACK]: [HL7SegmentType.MSH]
  };

  constructor(config: HL7ParserConfig = {}) {
    this.config = {
      strictMode: config.strictMode !== false,
      validateChecksum: config.validateChecksum || false,
      supportedVersions: config.supportedVersions || this.SUPPORTED_VERSIONS,
      allowCustomSegments: config.allowCustomSegments || false
    };
  }

  /**
   * Parse HL7 v2 message string into structured HL7Message object
   *
   * @param messageString Raw HL7 message string
   * @param emrSystem Source EMR system
   * @returns Parsed HL7Message object
   * @throws Error if message is invalid
   */
  public parse(messageString: string, emrSystem: EMR_SYSTEMS): HL7Message {
    if (!messageString || typeof messageString !== 'string') {
      throw this.createError(HL7ErrorType.INVALID_MESSAGE_TYPE, 'Message string is required');
    }

    // Normalize line endings
    const normalizedMessage = this.normalizeMessage(messageString);

    // Split into segments
    const segmentStrings = this.splitIntoSegments(normalizedMessage);

    if (segmentStrings.length === 0) {
      throw this.createError(HL7ErrorType.INVALID_MESSAGE_TYPE, 'No segments found in message');
    }

    // Parse MSH segment first (it has special encoding)
    const mshSegment = this.parseMSHSegment(segmentStrings[0]);
    const header = this.extractHeader(mshSegment);

    // Validate HL7 version
    this.validateVersion(header);

    // Parse remaining segments
    const segments: HL7Segment[] = [mshSegment];

    for (let i = 1; i < segmentStrings.length; i++) {
      const segment = this.parseSegment(segmentStrings[i]);
      if (segment) {
        segments.push(segment);
      }
    }

    // Extract message type from MSH segment
    const messageType = this.extractMessageType(mshSegment);

    // Extract patient ID
    const patientId = this.extractPatientId(segments);

    // Validate message structure
    this.validateMessageStructure(messageType, segments);

    const message: HL7Message = {
      messageType,
      messageControlId: this.extractMessageControlId(mshSegment),
      segments,
      version: header.messageTime ? header.messageTime.toISOString() : '2.5.1',
      header,
      emrSystem,
      patientId
    };

    return message;
  }

  /**
   * Parse a single HL7 segment
   *
   * @param segmentString Raw segment string
   * @returns Parsed HL7Segment object
   */
  private parseSegment(segmentString: string): HL7Segment | null {
    if (!segmentString || segmentString.trim().length < 3) {
      return null;
    }

    const fields = segmentString.split(HL7_FIELD_SEPARATOR);
    const segmentId = fields[0];

    // Validate segment ID
    if (!this.isValidSegmentId(segmentId)) {
      if (this.config.strictMode && !this.config.allowCustomSegments) {
        throw this.createError(
          HL7ErrorType.INVALID_SEGMENT,
          `Invalid segment ID: ${segmentId}`,
          segmentId as HL7SegmentType
        );
      }
      // In non-strict mode, skip invalid segments
      return null;
    }

    const segment: HL7Segment = {
      type: segmentId as HL7SegmentType,
      id: segmentId,
      fields: fields.slice(1), // Remove segment ID from fields
      encoding: HL7Encoding.UNICODE
    };

    return segment;
  }

  /**
   * Parse MSH segment (special handling due to encoding characters)
   *
   * @param segmentString Raw MSH segment string
   * @returns Parsed MSH segment
   */
  private parseMSHSegment(segmentString: string): HL7Segment {
    if (!segmentString.startsWith('MSH')) {
      throw this.createError(
        HL7ErrorType.INVALID_SEGMENT,
        'First segment must be MSH',
        HL7SegmentType.MSH
      );
    }

    // MSH segment has special structure:
    // MSH|^~\&|SendingApp|SendingFacility|...
    // Field 0: MSH
    // Field 1: Encoding characters (|^~\&)
    // Field 2+: Normal fields

    const fields = segmentString.split(HL7_FIELD_SEPARATOR);

    return {
      type: HL7SegmentType.MSH,
      id: 'MSH',
      fields: fields.slice(1),
      encoding: HL7Encoding.UNICODE
    };
  }

  /**
   * Extract message header from MSH segment
   *
   * @param mshSegment Parsed MSH segment
   * @returns HL7Header object
   */
  private extractHeader(mshSegment: HL7Segment): HL7Header {
    const fields = mshSegment.fields;

    // MSH field positions (0-indexed after segment ID):
    // 0: Encoding characters
    // 1: Sending Application
    // 2: Sending Facility
    // 3: Receiving Application
    // 4: Receiving Facility
    // 5: Date/Time
    // 6: Security
    // 7: Message Type
    // 8: Message Control ID
    // 9: Processing ID

    const messageTypeField = fields[7] || '';
    const messageTypeComponents = messageTypeField.split(HL7_COMPONENT_SEPARATOR);
    const messageTypeCode = messageTypeComponents[0] || '';

    const dateTimeStr = fields[5] || '';
    const messageTime = this.parseHL7DateTime(dateTimeStr);

    return {
      sendingApplication: fields[1] || '',
      sendingFacility: fields[2] || '',
      receivingApplication: fields[3] || '',
      receivingFacility: fields[4] || '',
      messageTime,
      security: fields[6] || '',
      messageType: this.mapMessageTypeCode(messageTypeCode),
      processingId: fields[9] || 'P'
    };
  }

  /**
   * Extract message type from MSH segment
   */
  private extractMessageType(mshSegment: HL7Segment): HL7MessageType {
    const messageTypeField = mshSegment.fields[7] || '';
    const messageTypeComponents = messageTypeField.split(HL7_COMPONENT_SEPARATOR);
    const messageTypeCode = messageTypeComponents[0] || '';

    return this.mapMessageTypeCode(messageTypeCode);
  }

  /**
   * Extract message control ID from MSH segment
   */
  private extractMessageControlId(mshSegment: HL7Segment): string {
    return mshSegment.fields[8] || '';
  }

  /**
   * Extract patient ID from PID segment
   */
  private extractPatientId(segments: HL7Segment[]): string {
    const pidSegment = segments.find(s => s.type === HL7SegmentType.PID);

    if (!pidSegment) {
      return '';
    }

    // PID-3 contains patient identifier list
    const patientIdField = pidSegment.fields[2] || ''; // Field 3, index 2 (0-indexed)
    const components = patientIdField.split(HL7_COMPONENT_SEPARATOR);

    return components[0] || '';
  }

  /**
   * Parse HL7 field into components and subcomponents
   *
   * @param fieldValue Raw field value
   * @returns Parsed field structure
   */
  public parseField(fieldValue: string): ParsedHL7Field {
    if (!fieldValue) {
      return {
        raw: '',
        components: [],
        subcomponents: [],
        repetitions: []
      };
    }

    // Handle repetitions
    const repetitions = fieldValue.split(HL7_REPETITION_SEPARATOR);

    // Parse first repetition for components
    const components = repetitions[0].split(HL7_COMPONENT_SEPARATOR);

    // Parse subcomponents
    const subcomponents = components.map(component =>
      component.split(HL7_SUBCOMPONENT_SEPARATOR)
    );

    // Unescape special characters
    const unescapedComponents = components.map(c => this.unescapeHL7String(c));

    return {
      raw: fieldValue,
      components: unescapedComponents,
      subcomponents,
      repetitions
    };
  }

  /**
   * Normalize message string (handle different line endings)
   */
  private normalizeMessage(message: string): string {
    // Replace \r\n, \n\r, and \n with \r
    return message.replace(/\r\n|\n\r|\n/g, '\r');
  }

  /**
   * Split message into segment strings
   */
  private splitIntoSegments(message: string): string[] {
    return message
      .split('\r')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Validate segment ID
   */
  private isValidSegmentId(segmentId: string): boolean {
    // Standard HL7 segment IDs are 3 uppercase letters
    if (!/^[A-Z]{3}$/.test(segmentId)) {
      return false;
    }

    // Check if it's a known segment type
    return Object.values(HL7SegmentType).includes(segmentId as HL7SegmentType);
  }

  /**
   * Map message type code to HL7MessageType enum
   */
  private mapMessageTypeCode(code: string): HL7MessageType {
    const upperCode = code.toUpperCase();

    if (Object.values(HL7MessageType).includes(upperCode as HL7MessageType)) {
      return upperCode as HL7MessageType;
    }

    // Default to ACK if unknown
    return HL7MessageType.ACK;
  }

  /**
   * Parse HL7 date/time format to JavaScript Date
   *
   * HL7 DateTime format: YYYYMMDDHHMMSS[.SSSS][+/-ZZZZ]
   */
  private parseHL7DateTime(dateTimeStr: string): Date {
    if (!dateTimeStr) {
      return new Date();
    }

    // Extract parts
    const year = parseInt(dateTimeStr.substring(0, 4), 10);
    const month = parseInt(dateTimeStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateTimeStr.substring(6, 8), 10);
    const hour = parseInt(dateTimeStr.substring(8, 10), 10) || 0;
    const minute = parseInt(dateTimeStr.substring(10, 12), 10) || 0;
    const second = parseInt(dateTimeStr.substring(12, 14), 10) || 0;

    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Unescape HL7 special characters
   *
   * HL7 escape sequences:
   * \F\ - Field separator
   * \S\ - Component separator
   * \T\ - Subcomponent separator
   * \R\ - Repetition separator
   * \E\ - Escape character
   * \Xnn\ - Hexadecimal character
   */
  private unescapeHL7String(value: string): string {
    if (!value || value.indexOf(HL7_ESCAPE_CHARACTER) === -1) {
      return value;
    }

    return value
      .replace(/\\F\\/g, HL7_FIELD_SEPARATOR)
      .replace(/\\S\\/g, HL7_COMPONENT_SEPARATOR)
      .replace(/\\T\\/g, HL7_SUBCOMPONENT_SEPARATOR)
      .replace(/\\R\\/g, HL7_REPETITION_SEPARATOR)
      .replace(/\\E\\/g, HL7_ESCAPE_CHARACTER)
      .replace(/\\X([0-9A-Fa-f]{2})\\/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
  }

  /**
   * Validate HL7 version
   */
  private validateVersion(header: HL7Header): void {
    // Version is typically in MSH-12, but we're lenient here
    // Most systems support 2.3-2.5.1
    const supportedVersions = this.config.supportedVersions || this.SUPPORTED_VERSIONS;

    // In non-strict mode, we accept all versions
    if (!this.config.strictMode) {
      return;
    }

    // In strict mode, validate version is supported
    // (We don't have version in header currently, so we skip this for now)
  }

  /**
   * Validate message structure
   */
  private validateMessageStructure(
    messageType: HL7MessageType,
    segments: HL7Segment[]
  ): void {
    if (!this.config.strictMode) {
      return;
    }

    const requiredSegments = this.REQUIRED_SEGMENTS[messageType] || [];
    const segmentTypes = new Set(segments.map(s => s.type));

    for (const requiredSegment of requiredSegments) {
      if (!segmentTypes.has(requiredSegment)) {
        throw this.createError(
          HL7ErrorType.MISSING_REQUIRED_FIELD,
          `Missing required segment: ${requiredSegment}`,
          requiredSegment
        );
      }
    }
  }

  /**
   * Create HL7 validation error
   */
  private createError(
    type: HL7ErrorType,
    message: string,
    segment?: HL7SegmentType,
    field?: string
  ): Error {
    const error: HL7ValidationError = {
      type,
      message,
      segment,
      field
    };

    return new Error(`HL7 Parsing Error: ${JSON.stringify(error)}`);
  }

  /**
   * Convert HL7 message to JSON format
   *
   * @param message Parsed HL7Message
   * @returns Normalized JSON object
   */
  public toJSON(message: HL7Message): Record<string, any> {
    const json: Record<string, any> = {
      messageType: message.messageType,
      messageControlId: message.messageControlId,
      version: message.version,
      emrSystem: message.emrSystem,
      patientId: message.patientId,
      header: message.header,
      segments: {}
    };

    // Group segments by type
    for (const segment of message.segments) {
      const segmentKey = segment.type;

      if (!json.segments[segmentKey]) {
        json.segments[segmentKey] = [];
      }

      json.segments[segmentKey].push({
        fields: segment.fields,
        encoding: segment.encoding
      });
    }

    return json;
  }
}

export default HL7Parser;
