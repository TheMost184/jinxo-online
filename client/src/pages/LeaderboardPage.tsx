import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { LINE_LABELS, type PlayerView, type RoomView, type RoundResultView } from '@jinxo/shared';
import { AnswerTile } from '../components/AnswerTile';
import { BoardFrame } from '../components/BoardFrame';
import { Avatar, Button } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';
import { topicStyle } from '../lib/palette';

/** Round Summary: Top 3 คำที่ตรงกันมากสุด, Top 3 ขวัญใจมหาชน, Leaderboard, กระดานทุกคน */
export function LeaderboardPage() {
  const room = useRoom();
  if (!room.roundResult) return null;
  return <RoundSummary room={room} result={room.roundResult} />;
}

const MEDAL = ['🥇', '🥈', '🥉'];

function RoundSummary({ room, result }: { room: RoomView; result: RoundResultView }) {
  const { actions } = useGame();
  const [busy, setBusy] = useState(false);
  const last = result.roundIndex + 1 >= room.config.game.rounds;
  const playersById = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = (id: string) => playersById.get(id)?.name ?? '?';
  const leaderIds = new Set(result.scores.filter((s) => s.rank === 1).map((s) => s.playerId));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16">
      <div className="text-center">
        <h1 className="text-4xl font-medium sm:text-5xl">จบรอบที่ {result.roundIndex + 1}</h1>
        <p className="mt-1 text-[16px] text-ink-soft">
          {last ? 'รอบสุดท้ายจบแล้ว ไปดูกันว่าใครชนะ' : `เหลืออีก ${room.config.game.rounds - result.roundIndex - 1} รอบ`}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="slab p-4 sm:p-5">
          <h2 className="mb-3 text-2xl font-medium">คำที่คิดตรงกันมากที่สุด</h2>
          {result.topMatched.length === 0 ? (
            <p className="text-ink-soft">รอบนี้ไม่มีใครคิดตรงกันเลย</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {result.topMatched.map((m, i) => (
                <motion.li
                  key={m.groupId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.12 }}
                  className="flex gap-3 rounded-2xl border-[2.5px] border-ink bg-paper p-3"
                >
                  <span className="text-3xl leading-none">{MEDAL[m.rank - 1] ?? m.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-2xl">{m.label}</span>
                      <span className="font-display text-lg text-ink-soft">{m.size} คน</span>
                    </p>
                    {m.variants.length > 1 && (
                      <p className="text-[14px] text-ink-soft">นับรวม: {m.variants.join(', ')}</p>
                    )}
                    <p className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-ink ${topicStyle(m.topicIndex).dot}`} />
                      <span className="truncate">{room.topics[m.topicIndex]?.question}</span>
                    </p>
                    <p className="mt-1 text-[14px]">{m.playerIds.map(nameOf).join(', ')}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          )}
        </section>

        <section className="slab p-4 sm:p-5">
          <h2 className="mb-1 text-2xl font-medium">คำตอบขวัญใจมหาชน</h2>
          <p className="mb-3 text-[13px] text-ink-soft">นับจาก ♥ ของเพื่อน ไม่มีผลกับคะแนนแข่งขัน</p>
          {result.topLiked.length === 0 ? (
            <p className="text-ink-soft">รอบนี้ยังไม่มีใครกด ♥ เลย</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {result.topLiked.map((l, i) => {
                const owner = playersById.get(l.playerId);
                return (
                  <motion.li
                    key={l.answerId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.12 }}
                    className="flex items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-jinx-soft p-3"
                  >
                    <span className="text-3xl leading-none">{MEDAL[l.rank - 1] ?? l.rank}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-2xl break-words">“{l.text}”</p>
                      <p className="flex items-center gap-1.5 text-[14px]">
                        โดย {owner && <Avatar name={owner.name} color={owner.color} size={20} />}
                        {owner?.name}
                      </p>
                    </div>
                    <span className="font-display text-xl">♥ {l.likes}</span>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <section className="slab p-3 sm:p-5">
        <h2 className="mb-3 px-1 text-2xl font-medium">อันดับ</h2>
        <ol className="flex flex-col gap-2">
          {result.scores.map((s, i) => {
            const first = leaderIds.has(s.playerId);
            return (
              <motion.li
                key={s.playerId}
                layout
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 220, damping: 22 }}
                className={`flex items-center gap-3 rounded-2xl border-[2.5px] border-ink px-3 py-2 sm:gap-4 ${
                  first ? 'bg-butter' : 'bg-paper'
                } ${s.playerId === room.you.id ? 'ring-4 ring-sky' : ''}`}
              >
                <span className="w-7 text-center font-display text-2xl">{s.rank}</span>
                <span className="relative">
                  <Avatar name={s.name} color={s.color} size={40} />
                  {first && (
                    <motion.span
                      className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl"
                      initial={{ y: -30, rotate: -30, opacity: 0 }}
                      animate={{ y: [-30, 0, -6, 0], rotate: [-30, 8, -4, 0], opacity: 1 }}
                      transition={{ delay: 0.6, duration: 0.8 }}
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
                    <span className="ml-1.5" title="Like ที่ได้รับรอบนี้ (ไม่นับเป็นคะแนน)">♥ {s.likes}</span>
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
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-medium">กระดานของทุกคน</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {result.boards.map((b) => (
            <BoardCard key={b.playerId} room={room} player={playersById.get(b.playerId)} board={b} />
          ))}
        </div>
      </section>

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

function BoardCard({
  room,
  player,
  board,
}: {
  room: RoomView;
  player: PlayerView | undefined;
  board: RoundResultView['boards'][number];
}) {
  return (
    <div className={`slab p-2 sm:p-3 ${board.playerId === room.you.id ? 'ring-4 ring-sky' : ''}`}>
      <div className="mb-2 flex items-center gap-2">
        {player && <Avatar name={player.name} color={player.color} size={26} />}
        <span className="min-w-0 flex-1 truncate font-medium">{player?.name}</span>
        <span className="text-[12px] text-ink-soft">♥ {board.likes}</span>
        <span className="rounded-lg border-2 border-ink bg-butter px-1.5 font-display">{board.points}</span>
      </div>
      <BoardFrame
        size="sm"
        scoring={room.config.scoring}
        achieved={board.bonusLines}
        renderCell={(i) => <AnswerTile cell={board.cells[i]} size="sm" />}
      />
    </div>
  );
}
