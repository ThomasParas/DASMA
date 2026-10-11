export type ImportErrorCode = 'noTextLayer' | 'encrypted' | 'unreadable' | 'unsupportedFormat' | 'empty';

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  noTextLayer: "Scanned PDFs aren't supported yet; paste the text instead.",
  encrypted: 'This PDF is password-protected; remove the password and try again.',
  unreadable: "This file couldn't be read; it may be damaged.",
  unsupportedFormat: 'Save it as .docx or PDF and try again.',
  empty: 'No script text was found in this file.',
};

export class ScriptImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(IMPORT_ERROR_MESSAGES[code]);
    this.name = 'ScriptImportError';
    this.code = code;
  }
}

export type FormatErrorReason = 'notJson' | 'notDasma' | 'newerVersion' | 'invalid';

const FORMAT_MESSAGES: Record<FormatErrorReason, string> = {
  notJson: 'This file is not a DASMA script.',
  notDasma: 'This file is not a DASMA script.',
  newerVersion: 'This script was made with a newer version of DASMA.',
  invalid: 'This DASMA script is damaged',
};

export class ScriptFormatError extends Error {
  readonly reason: FormatErrorReason;
  /** For `invalid`: the field at fault, e.g. `units[12].kind`. */
  readonly path?: string;
  constructor(reason: FormatErrorReason, path?: string) {
    super(path ? `${FORMAT_MESSAGES[reason]} (${path}).` : FORMAT_MESSAGES[reason]);
    this.name = 'ScriptFormatError';
    this.reason = reason;
    this.path = path;
  }
}
