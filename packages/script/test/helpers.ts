import { ScriptFormatError, ScriptImportError } from '../src/errors';

/** The `code` of the ScriptImportError (or `reason` of the ScriptFormatError) `fn` throws; null if it doesn't throw. */
export function thrownCode(fn: () => unknown): string | null {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScriptImportError) return err.code;
    if (err instanceof ScriptFormatError) return err.reason;
    throw err;
  }
  return null;
}
