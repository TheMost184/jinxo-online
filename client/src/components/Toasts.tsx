import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../hooks/useGame';

const STYLE = {
  info: 'bg-paper',
  success: 'bg-mint-soft',
  warn: 'bg-butter-soft',
  error: 'bg-jinx-soft',
} as const;

export function Toasts() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            type="button"
            onClick={() => dismissToast(t.id)}
            className={`pointer-events-auto max-w-md rounded-2xl border-[2.5px] border-ink px-4 py-2.5 text-left text-[15px] font-medium shadow-chunk ${STYLE[t.kind]}`}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
