import { motion } from 'framer-motion';
import { useState } from 'react';
import type { FinalResultView, RoomView } from '@jinxo/shared';
import { Confetti } from '../components/Celebrate';
import { Avatar, Button } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';

export function FinalResultPage() {
  const room = useRoom();
  if (!room.final) return null;
  return <FinalResult room={room} final={room.final} />;
}

function FinalResult({ room, final }: { room: RoomView; final: FinalResultView }) {
  const { actions } = useGame();
  const [busy, setBusy] = useState(false);
  const winners = final.standings.filter((s) => final.winnerIds.includes(s.playerId));
  const rounds = room.config.game.rounds;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 pb-16">
      <Confetti pieces={90} />
      <motion.div
        className="mt-4 flex flex-col items-center text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
      >
        <span className="text-6xl">🏆</span>
        <p className="mt-2 text-[16px] text-ink-soft">{winners.length > 1 ? 'เสมอกัน! ผู้ชนะคือ' : 'ผู้ชนะคือ'}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          {winners.map((w) => (
            <div key={w.playerId} className="slab flex items-center gap-3 !bg-butter px-5 py-3">
              <Avatar name={w.name} color={w.color} size={56} />
              <div className="text-left">
                <p className="font-display text-4xl leading-tight font-semibold">{w.name}</p>
                <p className="font-display text-lg">{w.total} แต้ม</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="slab w-full overflow-x-auto p-2 sm:p-4">
        <table className="w-full min-w-[420px] text-left">
          <thead>
            <tr className="text-[14px] text-ink-soft">
              <th className="px-2 py-2 font-normal">อันดับ</th>
              <th className="px-2 py-2 font-normal">ผู้เล่น</th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="px-2 py-2 text-right font-normal">
                  รอบ {i + 1}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-normal">JinxO</th>
              <th className="px-2 py-2 text-right font-normal">รวม</th>
            </tr>
          </thead>
          <tbody>
            {final.standings.map((s) => (
              <tr key={s.playerId} className={`border-t-2 border-ink/10 ${s.playerId === room.you.id ? 'bg-sky-soft' : ''}`}>
                <td className="px-2 py-2.5 font-display text-xl">{s.rank}</td>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar name={s.name} color={s.color} size={28} />
                    <span className="truncate font-medium">{s.name}</span>
                  </span>
                </td>
                {s.roundTotals.map((r, i) => (
                  <td key={i} className="px-2 py-2.5 text-right">
                    {r}
                  </td>
                ))}
                <td className="px-2 py-2.5 text-right">{s.jinxoCount}</td>
                <td className="px-2 py-2.5 text-right font-display text-2xl">{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        {room.you.isHost ? (
          <Button
            tone="pink"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await actions.playAgain();
              setBusy(false);
            }}
          >
            เล่นอีกรอบในห้องนี้
          </Button>
        ) : (
          <p className="text-center font-display text-lg text-ink-soft">รอ Host กดเล่นอีกรอบ</p>
        )}
      </div>
    </main>
  );
}
