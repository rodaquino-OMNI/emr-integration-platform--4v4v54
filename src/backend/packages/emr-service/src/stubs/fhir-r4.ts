/**
 * Stub for fhir/r4 package types
 * Minimal Resource interface for FHIR R4 compliance
 */

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface Narrative {
  status: 'generated' | 'extensions' | 'additional' | 'empty';
  div: string;
}

export interface Extension {
  url: string;
  valueString?: string;
  valueCode?: string;
  valueInteger?: number;
  valueBoolean?: boolean;
  [key: string]: any;
}

export interface Resource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  implicitRules?: string;
  language?: string;
  text?: Narrative;
  contained?: Resource[];
  extension?: Extension[];
  modifierExtension?: Extension[];
}

export interface DomainResource extends Resource {
  text?: Narrative;
  contained?: Resource[];
  extension?: Extension[];
  modifierExtension?: Extension[];
}
