import { useState } from 'react';
import { PlayerList } from '../components/PlayerList';
import { RulesSummary } from '../components/RulesSummary';
import { Button } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http ที่ไม่ใช่ localhost ใช้ clipboard API ไม่ได้ → fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function LobbyPage() {
  const room = useRoom();
  const { actions, toast } = useGame();
  const [starting, setStarting] = useState(false);
  const isHost = room.you.isHost;
  const { minPlayers, maxPlayers, rounds, topicsPerRound } = room.config.game;
  const online = room.players.filter((p) => p.connected).length;
  const need = rounds * topicsPerRound;
  const selected = new Set(room.selectedCategories);
  const questionCount = room.categories.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.count, 0);
  const inviteLink = `${location.origin}/?room=${room.code}`;

  const blocker =
    online < minPlayers
      ? `รอเพื่อนอีก ${minPlayers - online} คน (ต้องมีอย่างน้อย ${minPlayers} คน)`
      : questionCount < need
        ? `หมวดที่เลือกมีคำถาม ${questionCount} ข้อ ต้องมีอย่างน้อย ${need} ข้อ`
        : null;

  const toggleCategory = (id: string) => {
    if (!isHost) return;
    const next = selected.has(id) ? room.selectedCategories.filter((c) => c !== id) : [...room.selectedCategories, id];
    if (next.length === 0) {
      toast('warn', 'ต้องเลือกอย่างน้อย 1 หมวด');
      return;
    }
    void actions.setCategories(next);
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-16 md:grid-cols-[1fr_1.15fr]">
      <section className="flex flex-col gap-5">
        <div className="slab overflow-hidden">
          <div className="bg-butter px-5 pt-5 pb-4">
            <p className="text-[15px] text-ink-soft">รหัสห้อง ส่งให้เพื่อนใน Discord ได้เลย</p>
            <p className="font-display text-6xl font-semibold tracking-[0.18em] sm:text-7xl">{room.code}</p>
          </div>
          <div className="flex flex-wrap gap-2 border-t-[2.5px] border-ink p-4">
            <Button
              tone="paper"
              size="sm"
              onClick={async () => toast('success', (await copyText(room.code)) ? 'คัดลอกรหัสห้องแล้ว' : 'คัดลอกไม่สำเร็จ')}
            >
              คัดลอกรหัส
            </Button>
            <Button
              tone="pink"
              size="sm"
              onClick={async () => toast('success', (await copyText(inviteLink)) ? 'คัดลอกลิงก์เชิญแล้ว' : 'คัดลอกไม่สำเร็จ')}
            >
              คัดลอกลิงก์เชิญ
            </Button>
          </div>
        </div>

        <div className="slab p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-medium">ผู้เล่น</h2>
            <span className="font-display text-ink-soft">
              {room.players.length}/{maxPlayers}
            </span>
          </div>
          <PlayerList
            players={room.players}
            youId={room.you.id}
            emptySeats={Math.max(0, Math.min(maxPlayers - room.players.length, 3))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="slab p-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-medium">หมวดคำถาม</h2>
            <span className="text-[15px] text-ink-soft">{questionCount} ข้อ</span>
          </div>
          <p className="mb-4 text-[15px] text-ink-soft">
            {isHost ? 'แตะเพื่อเปิด/ปิดหมวด เกมจะสุ่มหัวข้อจากหมวดที่เลือก' : 'Host เป็นคนเลือกหมวด'}
          </p>
          <div className="flex flex-wrap gap-2">
            {room.categories.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!isHost}
                  aria-pressed={on}
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-2xl border-[2.5px] border-ink px-3.5 py-2 text-[16px] font-medium transition-[background,transform] ${
                    on ? 'bg-sky shadow-chunk-sm' : 'bg-paper text-ink-soft line-through decoration-2'
                  } ${isHost ? 'active:translate-y-0.5' : 'cursor-default'}`}
                >
                  <span className="mr-1.5 no-underline">{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="slab p-5">
          <h2 className="mb-3 text-xl font-medium">นับแต้มยังไง</h2>
          <RulesSummary scoring={room.config.scoring} />
          <p className="mt-3 text-[15px] text-ink-soft">
            เล่น {rounds} รอบ รอบละ {topicsPerRound} หัวข้อ คำที่สะกดต่างกันแต่หมายถึงสิ่งเดียวกัน Host รวมให้ได้ตอนเปิดคำตอบ
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          {isHost ? (
            <Button
              tone="mint"
              size="lg"
              disabled={Boolean(blocker) || starting}
              onClick={async () => {
                setStarting(true);
                await actions.startGame();
                setStarting(false);
              }}
            >
              {starting ? 'กำลังเริ่ม…' : 'เริ่มเกม'}
            </Button>
          ) : (
            <p className="rounded-2xl border-[2.5px] border-dashed border-ink/40 px-4 py-4 text-center font-display text-lg">
              รอ Host กดเริ่มเกม
            </p>
          )}
          {blocker && <p className="text-center text-[15px] text-ink-soft">{blocker}</p>}
        </div>
      </section>
    </main>
  );
}
