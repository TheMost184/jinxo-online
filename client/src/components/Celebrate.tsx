import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { PLAYER_COLORS } from '../lib/palette';

/** ชิ้นกระดาษสีโปรยลงมา — ใช้ตอนประกาศอันดับ 1 และผู้ชนะ */
export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        rotate: Math.random() * 720 - 360,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        w: 8 + Math.random() * 8,
        round: i % 3 === 0,
      })),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0 border-[1.5px] border-ink"
          style={{
            left: `${b.left}%`,
            width: b.w,
            height: b.round ? b.w : b.w * 0.5,
            background: b.color,
            borderRadius: b.round ? 999 : 2,
          }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', rotate: b.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: b.duration, delay: b.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/**
 * ป้าย "JinxO!" กระแทกกลางจอเมื่อมีคำที่ตรงกันพอดี 2 คน
 * key เปลี่ยน = เล่นใหม่ ให้ผู้เรียกเปลี่ยน burstKey ทุกครั้งที่เกิด JinxO ใหม่
 */
export function JinxOBurst({ burstKey, names, word }: { burstKey: string | null; names: string[]; word: string }) {
  return (
    <AnimatePresence>
      {burstKey && (
        <motion.div
          key={burstKey}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 1, 0] }}
          transition={{ duration: 2.2, times: [0, 0.75, 1] }}
          aria-hidden
        >
          <motion.div
            className="flex flex-col items-center"
            initial={{ scale: 0.2, rotate: -14 }}
            animate={{ scale: [0.2, 1.15, 1], rotate: [-14, 4, -3] }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <div className="relative">
              {Array.from({ length: 12 }, (_, i) => (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 h-3 w-3 rounded-full border-2 border-ink"
                  style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                  initial={{ x: 0, y: 0, scale: 0 }}
                  animate={{
                    x: Math.cos((i / 12) * Math.PI * 2) * 190,
                    y: Math.sin((i / 12) * Math.PI * 2) * 130,
                    scale: [0, 1.4, 0],
                  }}
                  transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }}
                />
              ))}
              <span className="relative block rounded-[28px] border-[4px] border-ink bg-jinx px-8 py-3 font-display text-6xl font-semibold text-white shadow-[0_8px_0_0_var(--color-ink)] sm:text-8xl">
                JinxO!
              </span>
            </div>
            <span className="mt-5 rounded-2xl border-[2.5px] border-ink bg-paper px-4 py-2 text-center font-display text-xl shadow-chunk">
              “{word}” — {names.join(' กับ ')}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
