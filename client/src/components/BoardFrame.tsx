import type { ReactNode } from 'react';
import type { LineId, PublicScoringConfig } from '@jinxo/shared';

/**
 * ถาดกระดาน 3×3 พร้อม "หมุดโบนัส" ด้านขวาของแต่ละแถวและใต้แต่ละคอลัมน์
 * ตัวช่องให้ผู้เรียกวาดเองผ่าน renderCell เพื่อใช้ซ้ำทั้งหน้าตอบคำถามและหน้าเปิดคำตอบ
 */
export function BoardFrame({
  scoring,
  renderCell,
  achieved = [],
  size = 'lg',
}: {
  scoring: PublicScoringConfig;
  renderCell: (index: number) => ReactNode;
  achieved?: LineId[];
  size?: 'lg' | 'sm';
}) {
  const lb = scoring.lineBonus;
  const big = size === 'lg';
  const gap = big ? 'gap-2 sm:gap-2.5' : 'gap-1';
  const peg = (line: LineId, value: number) =>
    lb.enabled && value > 0 ? (
      <span
        key={line}
        title={`โบนัส +${value} ถ้าทั้ง 3 ช่องในแนวนี้ตรงกับเพื่อน`}
        className={`flex items-center justify-center rounded-full border-ink font-display leading-none transition-colors ${
          big ? 'h-8 w-8 border-[2.5px] text-sm' : 'h-5 w-5 border-2 text-[10px]'
        } ${achieved.includes(line) ? 'bg-mint text-ink shadow-chunk-sm' : 'bg-paper/80 text-ink-soft'}`}
      >
        +{value}
      </span>
    ) : (
      <span key={line} className={big ? 'h-8 w-8' : 'h-5 w-5'} />
    );

  return (
    <div className={`grid grid-cols-[1fr_auto] grid-rows-[1fr_auto] ${gap}`}>
      <div
        className={`grid grid-cols-3 rounded-[20px] border-[2.5px] border-ink bg-mat-deep shadow-chunk ${gap} ${
          big ? 'p-2.5 sm:p-3' : 'rounded-xl p-1.5'
        }`}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="aspect-square min-w-0">
            {renderCell(i)}
          </div>
        ))}
      </div>
      <div className={`grid grid-rows-3 items-center ${gap} ${big ? 'py-2.5 sm:py-3' : 'py-1.5'}`}>
        {(['r0', 'r1', 'r2'] as const).map((l, i) => peg(l, lb.rows[i]))}
      </div>
      <div className={`grid grid-cols-3 justify-items-center ${gap} ${big ? 'px-2.5 sm:px-3' : 'px-1.5'}`}>
        {(['c0', 'c1', 'c2'] as const).map((l, i) => peg(l, lb.columns[i]))}
      </div>
    </div>
  );
}
