import { motion } from 'framer-motion';
import type { AnswerView, RevealCell } from '@jinxo/shared';
import { topicStyle } from '../lib/palette';

export function kindClass(a: Pick<AnswerView, 'kind' | 'duplicate'>): string {
  if (a.duplicate) return 'bg-mat-deep text-ink-soft';
  return a.kind === 'jinxo' ? 'bg-jinx text-white' : a.kind === 'match' ? 'bg-butter text-ink' : 'bg-paper text-ink';
}

/** ปุ่มหัวใจ — กดได้เฉพาะคำของคนอื่น */
export function LikeButton({
  count,
  liked,
  disabled,
  onToggle,
  small,
}: {
  count: number;
  liked: boolean;
  disabled: boolean;
  onToggle?: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? `เลิกถูกใจ (${count})` : `ถูกใจ (${count})`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`relative inline-flex items-center gap-0.5 rounded-full border-2 border-ink leading-none font-medium transition-transform ${
        small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[12px]'
      } ${liked ? 'bg-jinx text-white' : 'bg-paper text-ink'} ${disabled ? 'cursor-default opacity-80' : 'active:scale-90'}`}
    >
      <motion.span
        key={liked ? 'on' : 'off'}
        initial={liked ? { scale: 1.8, rotate: -15 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        aria-hidden
      >
        {liked ? '♥' : '♡'}
      </motion.span>
      <span>{count}</span>
    </button>
  );
}

/**
 * ช่องคำตอบบนกระดานช่วงเปิดคำตอบ/สรุปรอบ
 * hidden = การ์ดคว่ำ, shown = พลิกขึ้นมาพร้อมสถานะคะแนนและ Like
 */
export function AnswerTile({
  cell,
  size = 'lg',
  focused = false,
  liked = false,
  canLike = false,
  onLike,
}: {
  cell: RevealCell;
  size?: 'lg' | 'sm';
  focused?: boolean;
  liked?: boolean;
  canLike?: boolean;
  onLike?: (like: boolean) => void;
}) {
  const big = size === 'lg';
  const radius = big ? 'rounded-2xl' : 'rounded-lg';
  if (cell.state === 'empty') {
    return <div className={`h-full ${radius} border-2 border-dashed border-ink/20`} title="ไม่ได้ตอบ" />;
  }
  if (cell.state === 'hidden') {
    const ts = topicStyle(cell.topicIndex);
    return (
      <div
        className={`flex h-full items-center justify-center ${radius} border-[2.5px] border-ink ${ts.solid}`}
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent 0 7px, color-mix(in oklab, ${ts.hex} 35%, transparent) 7px 9px)`,
        }}
        aria-label="ยังไม่เปิด"
      >
        <span className={`font-display text-ink/35 ${big ? 'text-3xl' : 'text-lg'}`}>?</span>
      </div>
    );
  }
  const a = cell.answer;
  const ts = topicStyle(a.topicIndex);
  return (
    <motion.div
      key={a.id}
      initial={{ rotateY: 180, scale: 0.9 }}
      animate={{ rotateY: 0, scale: focused ? 1.04 : 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      className={`relative flex h-full flex-col items-center justify-center ${radius} border-[2.5px] border-ink p-1 text-center ${kindClass(a)} ${
        focused ? 'shadow-chunk ring-4 ring-sky' : ''
      }`}
      style={{ transformStyle: 'preserve-3d' }}
      title={a.duplicate ? 'คำนี้อยู่กลุ่มเดียวกับอีกช่องของเจ้าของ นับแต้มแค่ช่องเดียว' : undefined}
    >
      <span className={`absolute rounded-full border-[1.5px] border-ink ${ts.dot} ${big ? 'top-1.5 left-1.5 h-2.5 w-2.5' : 'top-1 left-1 h-1.5 w-1.5 border-0'}`} />
      {a.revealedBy === 'match' && a.kind !== 'none' && big && (
        <span className="absolute top-1 right-1 rounded-md bg-ink/15 px-1 text-[10px] leading-tight">ตรงแล้ว</span>
      )}
      <span
        className={`line-clamp-3 font-display leading-tight break-words ${big ? 'text-[15px] sm:text-lg' : 'text-[11px] sm:text-[12px]'}`}
      >
        {a.text}
      </span>
      <span className={`mt-0.5 flex items-center gap-1 ${big ? '' : 'scale-90'}`}>
        <span className={`leading-none ${big ? 'text-[12px]' : 'text-[10px]'} opacity-85`}>
          {a.duplicate ? 'ซ้ำ 0' : `+${a.points}`}
        </span>
        {(big || a.likes > 0) && (
          <LikeButton
            small={!big}
            count={a.likes}
            liked={liked}
            disabled={!canLike}
            onToggle={() => onLike?.(!liked)}
          />
        )}
      </span>
    </motion.div>
  );
}
