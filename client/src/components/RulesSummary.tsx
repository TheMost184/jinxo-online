import type { PublicScoringConfig } from '@jinxo/shared';

/** สรุปกติกาคะแนนจาก config ที่ server ส่งมา — เปลี่ยน config แล้วหน้านี้เปลี่ยนตาม */
export function RulesSummary({ scoring }: { scoring: PublicScoringConfig }) {
  const label = (min: number, max?: number) =>
    max === undefined ? `ตรงกัน ${min} คนขึ้นไป` : min === max ? (min === 1 ? 'ไม่ตรงกับใคร' : `ตรงกันพอดี ${min} คน`) : `ตรงกัน ${min}–${max} คน`;
  const lb = scoring.lineBonus;
  return (
    <div className="flex flex-col gap-2 text-[15px]">
      {scoring.tiers.map((t) => (
        <div key={`${t.minPlayers}-${t.maxPlayers}`} className="flex items-center justify-between gap-3">
          <span>
            {label(t.minPlayers, t.maxPlayers)}
            {t.kind === 'jinxo' && <span className="ml-1.5 rounded-md bg-jinx px-1.5 font-display text-sm text-white">JinxO</span>}
          </span>
          <span className="font-display text-lg">{t.points} แต้ม</span>
        </div>
      ))}
      {lb.enabled && (
        <p className="mt-1 text-ink-soft">
          โบนัสแนว: ถ้าทั้ง 3 ช่องในแถวหรือคอลัมน์{lb.condition === 'jinxo' ? 'เป็น JinxO ทั้งหมด' : 'ตรงกับเพื่อนทั้งหมด'}
          {' '}ได้แต้มตามหมุดข้างกระดาน
        </p>
      )}
    </div>
  );
}
