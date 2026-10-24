import { motion } from 'framer-motion';
import type { PlayerView } from '@jinxo/shared';
import { Avatar } from './ui';

function statusOf(p: PlayerView, showReady: boolean): { text: string; cls: string } | null {
  if (p.left) return { text: 'ออกแล้ว', cls: 'bg-mat-deep text-ink-soft' };
  if (!p.connected) return { text: 'หลุด', cls: 'bg-butter-soft text-ink' };
  if (!showReady) return null;
  if (p.ready) return { text: 'ตอบแล้ว', cls: 'bg-mint text-ink' };
  if (p.skipped) return { text: 'ข้าม', cls: 'bg-mat-deep text-ink-soft' };
  return { text: 'กำลังคิด…', cls: 'bg-paper text-ink-soft' };
}

/**
 * รายชื่อผู้เล่น — ห้อง 15 คนจะแสดงเป็น 2 คอลัมน์และเลื่อนในกรอบได้ (ไม่ล้นหน้าจอ)
 * onKick: ส่งมาเฉพาะเมื่อคนดูเป็น Host ใน Lobby
 */
export function PlayerList({
  players,
  youId,
  showReady = false,
  emptySeats = 0,
  onKick,
}: {
  players: PlayerView[];
  youId: string;
  showReady?: boolean;
  emptySeats?: number;
  onKick?: (p: PlayerView) => void;
}) {
  const dense = players.length > 7;
  return (
    <ul
      className={`grid gap-2 ${dense ? 'max-h-[min(60dvh,560px)] overflow-y-auto pr-1 sm:grid-cols-2' : ''}`}
      aria-label="รายชื่อผู้เล่น"
    >
      {players.map((p) => {
        const st = statusOf(p, showReady);
        return (
          <motion.li
            key={p.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex min-w-0 items-center rounded-2xl border-[2.5px] border-ink bg-paper ${
              dense ? 'gap-2 px-2 py-1.5' : 'gap-3 px-3 py-2'
            }`}
          >
            <Avatar name={p.name} color={p.color} size={dense ? 30 : 36} dim={!p.connected || p.left} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {p.name}
              {p.id === youId && <span className="ml-1.5 text-sm text-ink-soft">(คุณ)</span>}
            </span>
            {p.isHost && (
              <span title="Host" className="shrink-0 rounded-full border-2 border-ink bg-butter px-2 text-sm font-medium">
                {showReady || dense ? '👑' : '👑 Host'}
              </span>
            )}
            {st && <span className={`shrink-0 rounded-full border-2 border-ink px-2 text-sm ${st.cls}`}>{st.text}</span>}
            {onKick && p.id !== youId && (
              <button
                type="button"
                onClick={() => onKick(p)}
                aria-label={`เตะ ${p.name} ออกจากห้อง`}
                title="เตะออกจากห้อง"
                className="shrink-0 rounded-xl border-2 border-ink bg-paper px-2 text-sm font-medium text-danger hover:bg-jinx-soft"
              >
                เตะ
              </button>
            )}
          </motion.li>
        );
      })}
      {Array.from({ length: emptySeats }, (_, i) => (
        <li
          key={`empty-${i}`}
          className="flex items-center gap-3 rounded-2xl border-[2.5px] border-dashed border-ink/30 px-3 py-2 text-ink-soft/70"
        >
          <span className="h-9 w-9 rounded-full border-2 border-dashed border-ink/30" />
          ที่นั่งว่าง
        </li>
      ))}
    </ul>
  );
}
