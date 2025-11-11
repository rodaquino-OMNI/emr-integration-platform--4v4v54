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
  HL7_ESCAPE_CHARACTER,
  HL7_VERSION
} from '../types/hl7.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

/**
 * HL7 v2 Message Parser
 * Parses and validates HL7 v2.x messages (ADT, ORM, ORU, etc.)
 *
 * Supports:
 * - ADT (Admit/Discharge/Transfer) messages
 * - ORM (Order) messages
 * - ORU (Observation Result) messages
 * - MSH, PID, PV1, OBX, OBR, NTE, EVN segments
 */
export class HL7Parser {
  private readonly fieldSeparator: string;
  private readonly componentSeparator: string;
  private readonly subcomponentSeparator: string;
  private readonly repetitionSeparator: string;
  private readonly escapeCharacter: string;

  constructor() {
    this.fieldSeparator = HL7_FIELD_SEPARATOR;
    this.componentSeparator = HL7_COMPONENT_SEPARATOR;
    this.subcomponentSeparator = HL7_SUBCOMPONENT_SEPARATOR;
    this.repetitionSeparator = HL7_REPETITION_SEPARATOR;
    this.escapeCharacter = HL7_ESCAPE_CHARACTER;
  }

  /**
   * Parse a raw HL7 v2 message string into structured HL7Message object
   *
   * @param rawMessage Raw HL7 message string
   * @param emrSystem EMR system source
   * @returns Parsed HL7Message
   * @throws Error if message is invalid
   */
  public parseMessage(rawMessage: string, emrSystem: EMR_SYSTEMS): HL7Message {
    const errors: HL7ValidationError[] = [];

    // Validate message is not empty
    if (!rawMessage || rawMessage.trim().length === 0) {
      throw new Error('HL7 message cannot be empty');
    }

    // Split message into segments (separated by \r or \n)
    const segmentStrings = rawMessage.split(/\r?\n/).filter(s => s.trim().length > 0);

    if (segmentStrings.length === 0) {
      throw new Error('HL7 message must contain at least one segment');
    }

    // First segment must be MSH
    if (!segmentStrings[0].startsWith('MSH')) {
      throw new Error('HL7 message must start with MSH segment');
    }

    // Parse MSH header
    const header = this.parseMSHSegment(segmentStrings[0]);

    // Parse all segments
    const segments: HL7Segment[] = [];
    let patientId = '';

    for (let i = 0; i < segmentStrings.length; i++) {
      const segmentString = segmentStrings[i];
      const segment = this.parseSegment(segmentString, i);
      segments.push(segment);

      // Extract patient ID from PID segment
      if (segment.type === HL7SegmentType.PID && segment.fields.length > 2) {
        patientId = this.extractPatientId(segment.fields[2]);
      }
    }

    // Validate required segments
    if (!patientId) {
      errors.push({
        type: HL7ErrorType.MISSING_REQUIRED_FIELD,
        message: 'Patient ID not found in PID segment',
        segment: HL7SegmentType.PID,
        field: 'PatientID'
      });
    }

    if (errors.length > 0) {
      throw new Error(`HL7 validation errors: ${errors.map(e => e.message).join(', ')}`);
    }

    // Generate message control ID from MSH segment
    const mshFields = segmentStrings[0].split(this.fieldSeparator);
    const messageControlId = mshFields[9] || `MSG_${Date.now()}`;

    return {
      messageType: header.messageType,
      messageControlId,
      segments,
      version: HL7_VERSION,
      header,
      emrSystem,
      patientId
    };
  }

  /**
   * Parse MSH (Message Header) segment
   *
   * @param mshString MSH segment string
   * @returns HL7Header object
   */
  private parseMSHSegment(mshString: string): HL7Header {
    // MSH segment structure: MSH|^~\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|Timestamp|Security|MessageType^Event|...
    const fields = mshString.split(this.fieldSeparator);

    if (fields.length < 12) {
      throw new Error('MSH segment must have at least 12 fields');
    }

    // Extract message type (field 8)
    const messageTypeField = fields[8];
    const messageTypeComponents = messageTypeField.split(this.componentSeparator);
    const messageTypeCode = messageTypeComponents[0];

    // Map message type code to enum
    let messageType: HL7MessageType;
    if (messageTypeCode.startsWith('ADT')) {
      messageType = HL7MessageType.ADT;
    } else if (messageTypeCode.startsWith('ORM')) {
      messageType = HL7MessageType.ORM;
    } else if (messageTypeCode.startsWith('ORU')) {
      messageType = HL7MessageType.ORU;
    } else if (messageTypeCode.startsWith('SIU')) {
      messageType = HL7MessageType.SIU;
    } else if (messageTypeCode.startsWith('MDM')) {
      messageType = HL7MessageType.MDM;
    } else if (messageTypeCode.startsWith('DFT')) {
      messageType = HL7MessageType.DFT;
    } else if (messageTypeCode.startsWith('BAR')) {
      messageType = HL7MessageType.BAR;
    } else if (messageTypeCode.startsWith('ACK')) {
      messageType = HL7MessageType.ACK;
    } else {
      throw new Error(`Unsupported message type: ${messageTypeCode}`);
    }

    // Parse message timestamp (field 6)
    const messageTimeString = fields[6];
    const messageTime = this.parseHL7DateTime(messageTimeString);

    return {
      sendingApplication: fields[2] || '',
      sendingFacility: fields[3] || '',
      receivingApplication: fields[4] || '',
      receivingFacility: fields[5] || '',
      messageTime,
      security: fields[7] || '',
      messageType,
      processingId: fields[10] || 'P'
    };
  }

  /**
   * Parse individual HL7 segment
   *
   * @param segmentString Segment string
   * @param index Segment index in message
   * @returns HL7Segment object
   */
  private parseSegment(segmentString: string, index: number): HL7Segment {
    const fields = segmentString.split(this.fieldSeparator);
    const segmentTypeStr = fields[0];

    // Validate segment type
    const segmentType = this.getSegmentType(segmentTypeStr);

    return {
      type: segmentType,
      id: `${segmentTypeStr}_${index}`,
      fields: fields.slice(1), // Exclude segment type field
      encoding: HL7Encoding.UNICODE
    };
  }

  /**
   * Get segment type enum from string
   *
   * @param segmentTypeStr Segment type string
   * @returns HL7SegmentType enum
   */
  private getSegmentType(segmentTypeStr: string): HL7SegmentType {
    const segmentTypeMap: Record<string, HL7SegmentType> = {
      'MSH': HL7SegmentType.MSH,
      'PID': HL7SegmentType.PID,
      'PV1': HL7SegmentType.PV1,
      'OBR': HL7SegmentType.OBR,
      'OBX': HL7SegmentType.OBX,
      'NTE': HL7SegmentType.NTE,
      'EVN': HL7SegmentType.EVN
    };

    return segmentTypeMap[segmentTypeStr] || segmentTypeStr as HL7SegmentType;
  }

  /**
   * Extract patient ID from PID field (handles complex patient ID structure)
   *
   * @param pidField Patient ID field
   * @returns Patient ID
   */
  private extractPatientId(pidField: string): string {
    // PID field may have components: ID^IDType^AssigningAuthority
    const components = pidField.split(this.componentSeparator);
    return components[0] || pidField;
  }

  /**
   * Parse HL7 datetime format (YYYYMMDDHHMMSS or YYYYMMDD)
   *
   * @param dateTimeString HL7 datetime string
   * @returns Date object
   */
  private parseHL7DateTime(dateTimeString: string): Date {
    if (!dateTimeString) {
      return new Date();
    }

    // Remove any non-numeric characters
    const cleanString = dateTimeString.replace(/[^0-9]/g, '');

    // Parse different formats
    if (cleanString.length >= 14) {
      // YYYYMMDDHHMMSS
      const year = parseInt(cleanString.substring(0, 4));
      const month = parseInt(cleanString.substring(4, 6)) - 1;
      const day = parseInt(cleanString.substring(6, 8));
      const hour = parseInt(cleanString.substring(8, 10));
      const minute = parseInt(cleanString.substring(10, 12));
      const second = parseInt(cleanString.substring(12, 14));
      return new Date(year, month, day, hour, minute, second);
    } else if (cleanString.length >= 8) {
      // YYYYMMDD
      const year = parseInt(cleanString.substring(0, 4));
      const month = parseInt(cleanString.substring(4, 6)) - 1;
      const day = parseInt(cleanString.substring(6, 8));
      return new Date(year, month, day);
    } else {
      return new Date();
    }
  }

  /**
   * Extract specific segment by type
   *
   * @param message HL7 message
   * @param segmentType Segment type to extract
   * @returns Array of matching segments
   */
  public getSegments(message: HL7Message, segmentType: HL7SegmentType): HL7Segment[] {
    return message.segments.filter(segment => segment.type === segmentType);
  }

  /**
   * Extract field value from segment
   *
   * @param segment HL7 segment
   * @param fieldIndex Field index (0-based)
   * @param componentIndex Optional component index
   * @returns Field value
   */
  public getFieldValue(segment: HL7Segment, fieldIndex: number, componentIndex?: number): string {
    if (fieldIndex >= segment.fields.length) {
      return '';
    }

    const field = segment.fields[fieldIndex];

    if (componentIndex !== undefined) {
      const components = field.split(this.componentSeparator);
      return components[componentIndex] || '';
    }

    return field;
  }

  /**
   * Validate message structure
   *
   * @param message HL7 message
   * @returns Array of validation errors (empty if valid)
   */
  public validateMessage(message: HL7Message): HL7ValidationError[] {
    const errors: HL7ValidationError[] = [];

    // Check for required MSH segment
    const mshSegments = this.getSegments(message, HL7SegmentType.MSH);
    if (mshSegments.length === 0) {
      errors.push({
        type: HL7ErrorType.MISSING_REQUIRED_FIELD,
        message: 'MSH segment is required',
        segment: HL7SegmentType.MSH
      });
    }

    // Check for required PID segment
    const pidSegments = this.getSegments(message, HL7SegmentType.PID);
    if (pidSegments.length === 0) {
      errors.push({
        type: HL7ErrorType.MISSING_REQUIRED_FIELD,
        message: 'PID segment is required',
        segment: HL7SegmentType.PID
      });
    }

    // Validate patient ID is present
    if (!message.patientId) {
      errors.push({
        type: HL7ErrorType.MISSING_REQUIRED_FIELD,
        message: 'Patient ID is required',
        segment: HL7SegmentType.PID,
        field: 'PatientID'
      });
    }

    return errors;
  }
}

/**
 * Export singleton instance
 */
export const hl7Parser = new HL7Parser();
