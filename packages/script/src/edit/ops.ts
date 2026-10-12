import type { UnitKind } from '../types';

/** One correction on the tag-correction screen (spec §6.2). Every op sets tagConfidence 1 on the units it touches. */
export type EditOp =
  | { type: 'confirm'; unitIds: string[] }
  | { type: 'setKind'; unitIds: string[]; kind: Extract<UnitKind, 'direction' | 'heading' | 'frontMatter'> }
  | { type: 'speechBy'; unitIds: string[]; characterId: string }
  | { type: 'newCharacter'; id: string; name: string }
  | { type: 'setName'; unitId: string; characterId: string }
  | { type: 'editText'; unitId: string; text: string }
  | { type: 'split'; unitId: string; atWord: number }
  | { type: 'join'; unitId: string }
  | { type: 'remove'; unitIds: string[] }
  | { type: 'setCut'; unitIds: string[]; cut: boolean }
  | { type: 'setCutWords'; unitId: string; from: number; to: number; cut: boolean }
  | { type: 'setOverlap'; unitId: string; from: number; to: number; on: boolean }
  | { type: 'insertSceneBreak'; beforeUnitId: string }
  | { type: 'removeSceneBreak'; unitId: string }
  | { type: 'renameCharacter'; characterId: string; name: string }
  | { type: 'editAliases'; characterId: string; aliases: string[] }
  | { type: 'mergeCharacters'; fromId: string; intoId: string }
  | { type: 'splitAlias'; characterId: string; alias: string; newId: string; unitIds: string[] }
  | { type: 'moveSpeeches'; unitIds: string[]; characterId: string }
  | { type: 'batch'; ops: EditOp[] };

/** An op that does not apply to this script; the script is unchanged and the message is shown to the user. */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}
