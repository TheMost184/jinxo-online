import type { ErrorCode } from '@jinxo/shared';

/** error ที่ตั้งใจโยนให้ผู้เล่นเห็น — message เป็นภาษาไทยที่อ่านเข้าใจได้ทันที */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
