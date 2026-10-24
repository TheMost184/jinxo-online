import { AnimatePresence, motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { playerColor } from '../lib/palette';

type Tone = 'pink' | 'mint' | 'butter' | 'sky' | 'paper' | 'ink';

const TONES: Record<Tone, string> = {
  pink: 'bg-jinx text-white',
  mint: 'bg-mint text-ink',
  butter: 'bg-butter text-ink',
  sky: 'bg-sky text-ink',
  paper: 'bg-paper text-ink',
  ink: 'bg-ink text-white',
};

export function Button({
  tone = 'pink',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? '!px-3 !py-1.5 !text-[15px] !rounded-xl' : size === 'lg' ? '!px-7 !py-4 !text-xl' : '';
  return (
    <button type="button" className={`btn ${TONES[tone]} ${sz} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Avatar({ name, color, size = 36, dim = false }: { name: string; color: number; size?: number; dim?: boolean }) {
  // ชื่อไทยที่ขึ้นต้นด้วยสระหน้า (เ แ โ ใ ไ) ใช้พยัญชนะตัวแรกแทน เช่น "โมส" → "ม"
  const initial = [...name.trim().replace(/^[\u0E40-\u0E44]+/, '')][0] ?? [...name.trim()][0] ?? '?';
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-display font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        background: playerColor(color),
        opacity: dim ? 0.4 : 1,
      }}
    >
      {initial}
    </span>
  );
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-medium ${className}`}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="slab w-full max-w-sm p-6"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-2xl font-medium">{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-ink-soft">
      <motion.div
        className="grid grid-cols-3 gap-1"
        animate={{ rotate: [0, 90, 90, 180] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`h-3 w-3 rounded-[4px] border-2 border-ink ${i % 2 ? 'bg-jinx' : 'bg-paper'}`} />
        ))}
      </motion.div>
      <p className="font-display text-lg">{label}</p>
    </div>
  );
}
