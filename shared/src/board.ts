import type { LineId } from './types.js';

export const BOARD_SIZE = 9;
export const BOARD_COLS = 3;

/** ช่องในแต่ละแนว (index 0–8 เรียงซ้าย→ขวา บน→ล่าง) */
export const LINES: Record<LineId, readonly [number, number, number]> = {
  r0: [0, 1, 2],
  r1: [3, 4, 5],
  r2: [6, 7, 8],
  c0: [0, 3, 6],
  c1: [1, 4, 7],
  c2: [2, 5, 8],
  d0: [0, 4, 8],
  d1: [2, 4, 6],
};

export const LINE_LABELS: Record<LineId, string> = {
  r0: 'แถวบน',
  r1: 'แถวกลาง',
  r2: 'แถวล่าง',
  c0: 'คอลัมน์ซ้าย',
  c1: 'คอลัมน์กลาง',
  c2: 'คอลัมน์ขวา',
  d0: 'แนวทแยง ↘',
  d1: 'แนวทแยง ↙',
};
