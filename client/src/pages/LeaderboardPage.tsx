import { motion } from 'framer-motion';
import { useState } from 'react';
import { LINE_LABELS, type RoomView, type RoundResultView } from '@jinxo/shared';
import { Avatar, Button } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';

export function LeaderboardPage() {
  const room = useRoom();
  if (!room.roundResult) return null;
  return <Leaderboard room={room} result={room.roundResult} />;
}

function Leaderboard({ room, result }: { room: RoomView; result: RoundResultView }) {
  const { actions } = useGame();
  const [busy, setBusy] = useState(false);
  const last = result.roundIndex + 1 >= room.config.game.rounds;
  const leaderIds = new Set(result.scores.filter((s) => s.rank === 1).map((s) => s.playerId));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-16">
      <div className="text-center">
        <h1 className="text-4xl font-medium sm:text-5xl">จบรอบที่ {result.roundIndex + 1}</h1>
        <p className="mt-1 text-[16px] text-ink-soft">
          {last ? 'รอบสุดท้ายจบแล้ว ไปดูกันว่าใครชนะ' : `เหลืออีก ${room.config.game.rounds - result.roundIndex - 1} รอบ`}
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {result.scores.map((s, i) => {
          const first = leaderIds.has(s.playerId);
          return (
            <motion.li
              key={s.playerId}
              layout
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 220, damping: 22 }}
              className={`slab flex items-center gap-3 px-4 py-3 sm:gap-4 ${first ? '!bg-butter' : ''} ${
                s.playerId === room.you.id ? 'ring-4 ring-sky' : ''
              }`}
            >
              <span className="w-8 text-center font-display text-3xl">{s.rank}</span>
              <span className="relative">
                <Avatar name={s.name} color={s.color} size={44} />
                {first && (
                  <motion.span
                    className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl"
                    initial={{ y: -30, rotate: -30, opacity: 0 }}
                    animate={{ y: [-30, 0, -6, 0], rotate: [-30, 8, -4, 0], opacity: 1 }}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.8 }}
                    aria-label="อันดับ 1"
                  >
                    👑
                  </motion.span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl">{s.name}</p>
                <p className="text-[14px] text-ink-soft">
                  รอบนี้ {s.basePoints} แต้ม
                  {s.bonusPoints > 0 && <span className="text-ink"> + โบนัส {s.bonusPoints}</span>}
                  {s.jinxoCount > 0 && <span className="ml-1.5 rounded-md bg-jinx px-1.5 text-white">JinxO ×{s.jinxoCount}</span>}
                </p>
                {s.bonusLines.length > 0 && (
                  <p className="text-[13px] text-ink-soft">{s.bonusLines.map((l) => LINE_LABELS[l]).join(', ')}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-display text-sm text-ink-soft">+{s.roundTotal}</p>
                <p className="font-display text-3xl leading-none">{s.total}</p>
              </div>
            </motion.li>
          );
        })}
      </ol>

      {room.you.isHost ? (
        <Button
          tone={last ? 'pink' : 'mint'}
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await actions.nextRound();
            setBusy(false);
          }}
        >
          {last ? 'ดูผลสรุปทั้งเกม' : `เริ่มรอบที่ ${result.roundIndex + 2}`}
        </Button>
      ) : (
        <p className="text-center font-display text-lg text-ink-soft">รอ Host ไปต่อ</p>
      )}
    </main>
  );
}
