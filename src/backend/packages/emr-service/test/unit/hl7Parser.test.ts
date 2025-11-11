import { describe, it, expect } from '@jest/globals';
import { HL7Parser } from '../../src/utils/hl7Parser';

describe('HL7Parser', () => {
  let parser: HL7Parser;

  beforeEach(() => {
    parser = new HL7Parser();
  });

  describe('ADT Messages (Patient Administration)', () => {
    it('should parse ADT^A01 (Patient Admission)', () => {
      const hl7Message = `MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20230801120000||ADT^A01|MSG001|P|2.5
EVN|A01|20230801120000
PID|1||MRN123^^^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345||555-1234|||M|NON|123456789
PV1|1|I|ICU^201^1^||||^SMITH^JOHN^A^^^MD||||MED||||ADM|PAYOR123|||||||||||||||||||||||||20230801120000`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('ADT');
      expect(result.eventType).toBe('A01');
      expect(result.patient.mrn).toBe('MRN123');
      expect(result.patient.lastName).toBe('DOE');
      expect(result.patient.firstName).toBe('JOHN');
      expect(result.patient.gender).toBe('M');
      expect(result.patient.dob).toBe('19800101');
    });

    it('should parse ADT^A03 (Patient Discharge)', () => {
      const hl7Message = `MSH|^~\\&|APP|FAC|RECV|FAC|20230801150000||ADT^A03|MSG002|P|2.5
EVN|A03|20230801150000
PID|1||MRN123^^^MR||DOE^JOHN^A||19800101|M
PV1|1|I|ICU^201^1||||^SMITH^JOHN^A^^^MD
PV2|||Discharged to Home`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('ADT');
      expect(result.eventType).toBe('A03');
      expect(result.discharge).toBeDefined();
      expect(result.discharge.disposition).toContain('Home');
    });

    it('should parse ADT^A08 (Patient Update)', () => {
      const hl7Message = `MSH|^~\\&|APP|FAC|RECV|FAC|20230801150000||ADT^A08|MSG003|P|2.5
EVN|A08|20230801150000
PID|1||MRN123^^^MR||DOE^JOHN^A||19800101|M|||456 NEW ST^^CITY^ST^54321
PV1|1|O|CLINIC^101^1`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('ADT');
      expect(result.eventType).toBe('A08');
      expect(result.patient.address).toContain('456 NEW ST');
    });
  });

  describe('ORU Messages (Observation Results)', () => {
    it('should parse ORU^R01 (Lab Results)', () => {
      const hl7Message = `MSH|^~\\&|LAB|FACILITY|RECV|FAC|20230801140000||ORU^R01|MSG004|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN
OBR|1|ORDER123|RESULT123|CBC^Complete Blood Count||20230801120000|||||||20230801130000||^DOCTOR^ORDERING|||||||LAB
OBX|1|NM|WBC^White Blood Count||7.5|10*3/uL|4.0-11.0|N|||F|||20230801130000
OBX|2|NM|RBC^Red Blood Count||4.8|10*6/uL|4.5-5.5|N|||F|||20230801130000
OBX|3|NM|HGB^Hemoglobin||14.5|g/dL|13.5-17.5|N|||F|||20230801130000`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('ORU');
      expect(result.eventType).toBe('R01');
      expect(result.observations).toHaveLength(3);
      expect(result.observations[0].code).toBe('WBC');
      expect(result.observations[0].value).toBe('7.5');
      expect(result.observations[0].units).toBe('10*3/uL');
      expect(result.observations[0].referenceRange).toBe('4.0-11.0');
      expect(result.observations[0].abnormalFlag).toBe('N');
    });

    it('should parse abnormal lab results', () => {
      const hl7Message = `MSH|^~\\&|LAB|FAC|RECV|FAC|20230801140000||ORU^R01|MSG005|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN
OBR|1|ORDER123|RESULT123|GLUCOSE||20230801120000
OBX|1|NM|GLU^Glucose||250|mg/dL|70-100|H|||F|||20230801130000`;

      const result = parser.parse(hl7Message);

      expect(result.observations[0].abnormalFlag).toBe('H');
      expect(parseFloat(result.observations[0].value)).toBeGreaterThan(100);
    });
  });

  describe('ORM Messages (Orders)', () => {
    it('should parse ORM^O01 (New Order)', () => {
      const hl7Message = `MSH|^~\\&|CPOE|FAC|PHARM|FAC|20230801100000||ORM^O01|MSG006|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN
ORC|NW|ORDER123||||||20230801100000
RXO|ASPIRIN^Aspirin 81mg||81^MG||PO|QD|||||0||DAYS^365
RXR|PO||`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('ORM');
      expect(result.eventType).toBe('O01');
      expect(result.order).toBeDefined();
      expect(result.order.medication).toContain('Aspirin');
      expect(result.order.route).toBe('PO');
      expect(result.order.frequency).toBe('QD');
    });
  });

  describe('SIU Messages (Scheduling)', () => {
    it('should parse SIU^S12 (New Appointment)', () => {
      const hl7Message = `MSH|^~\\&|SCHED|FAC|RECV|FAC|20230801100000||SIU^S12|MSG007|P|2.5
SCH|APPT123|||CHECKUP^Annual Checkup||||30||MIN||BOOKED|||20230815140000|20230815143000
PID|1||MRN123^^^MR||DOE^JOHN
AIG|1|ROOM1^Exam Room 1||20230815140000|30||MIN`;

      const result = parser.parse(hl7Message);

      expect(result.messageType).toBe('SIU');
      expect(result.eventType).toBe('S12');
      expect(result.appointment).toBeDefined();
      expect(result.appointment.status).toBe('BOOKED');
      expect(result.appointment.duration).toBe('30');
    });
  });

  describe('Field Parsing', () => {
    it('should handle field separators correctly', () => {
      const field = 'COMPONENT1^COMPONENT2^COMPONENT3';
      const components = parser.splitField(field, '^');

      expect(components).toHaveLength(3);
      expect(components[0]).toBe('COMPONENT1');
      expect(components[2]).toBe('COMPONENT3');
    });

    it('should handle escape sequences', () => {
      const field = 'Text with \\T\\ tab and \\R\\ return';
      const unescaped = parser.unescape(field);

      expect(unescaped).toContain('\t');
    });

    it('should handle repetition separator', () => {
      const field = 'VALUE1~VALUE2~VALUE3';
      const values = parser.splitField(field, '~');

      expect(values).toHaveLength(3);
    });
  });

  describe('Validation', () => {
    it('should validate message structure', () => {
      const validMessage = `MSH|^~\\&|APP|FAC|RECV|FAC|20230801120000||ADT^A01|MSG001|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN`;

      const isValid = parser.validate(validMessage);

      expect(isValid).toBe(true);
    });

    it('should reject invalid message structure', () => {
      const invalidMessage = 'Not a valid HL7 message';

      const isValid = parser.validate(invalidMessage);

      expect(isValid).toBe(false);
    });

    it('should require MSH segment', () => {
      const missingMSH = `PID|1||MRN123^^^MR||DOE^JOHN`;

      const isValid = parser.validate(missingMSH);

      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed segments gracefully', () => {
      const malformedMessage = `MSH|^~\\&|APP|FAC|RECV|FAC|20230801120000||ADT^A01|MSG001|P|2.5
INVALID_SEGMENT`;

      expect(() => parser.parse(malformedMessage)).not.toThrow();
    });

    it('should handle missing required fields', () => {
      const incompleteMessage = `MSH|^~\\&|APP|FAC
PID|1||`;

      const result = parser.parse(incompleteMessage);

      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Conversion to FHIR', () => {
    it('should convert HL7 patient to FHIR Patient resource', () => {
      const hl7Message = `MSH|^~\\&|APP|FAC|RECV|FAC|20230801120000||ADT^A01|MSG001|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345||555-1234`;

      const parsed = parser.parse(hl7Message);
      const fhirResource = parser.toFHIR(parsed);

      expect(fhirResource.resourceType).toBe('Patient');
      expect(fhirResource.identifier[0].value).toBe('MRN123');
      expect(fhirResource.name[0].family).toBe('DOE');
      expect(fhirResource.name[0].given[0]).toBe('JOHN');
      expect(fhirResource.gender).toBe('male');
    });

    it('should convert HL7 observation to FHIR Observation resource', () => {
      const hl7Message = `MSH|^~\\&|LAB|FAC|RECV|FAC|20230801140000||ORU^R01|MSG004|P|2.5
PID|1||MRN123^^^MR||DOE^JOHN
OBR|1|ORDER123|RESULT123|CBC||20230801120000
OBX|1|NM|WBC^White Blood Count||7.5|10*3/uL|4.0-11.0|N|||F|||20230801130000`;

      const parsed = parser.parse(hl7Message);
      const fhirResource = parser.toFHIR(parsed);

      expect(fhirResource.resourceType).toBe('Observation');
      expect(fhirResource.code.text).toBe('White Blood Count');
      expect(fhirResource.valueQuantity.value).toBe(7.5);
      expect(fhirResource.valueQuantity.unit).toBe('10*3/uL');
    });
  });
});
