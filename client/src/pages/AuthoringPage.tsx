import { motion } from 'framer-motion';
import { useState } from 'react';
import { Avatar, Button, Modal } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';
import { topicStyle } from '../lib/palette';

/** โหมดคิดโจทย์เอง — คนที่ถูกสุ่มพิมพ์โจทย์ คนอื่นรอ */
export function AuthoringPage() {
  const room = useRoom();
  if (!room.authoring) return null;
  return <Authoring key={`${room.roundIndex}-${room.authoring.topicIndex}-${room.authoring.authorId}`} />;
}

const IDEAS = ['ผลไม้สีเหลือง', 'ของที่ต้องพกไปทะเล', 'ข้ออ้างตอนตื่นสาย', 'ร้านที่ไปบ่อยในห้าง', 'สิ่งที่ทำตอนนอนไม่หลับ'];

function Authoring() {
  const room = useRoom();
  const { actions } = useGame();
  const a = room.authoring!;
  const author = room.players.find((p) => p.id === a.authorId);
  const mine = a.authorId === room.you.id;
  const style = topicStyle(a.topicIndex);
  const max = room.config.game.maxQuestionLength;
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [placeholder] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)]);

  const header = (
    <p className="text-[15px] text-ink-soft">
      รอบ {room.roundIndex + 1} โจทย์ที่ {a.topicIndex + 1} จาก {room.config.game.topicsPerRound}
    </p>
  );

  if (mine) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-16">
        <motion.section
          className="slab overflow-hidden"
          initial={{ scale: 0.92, rotate: -2 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        >
          <div className={`h-3 border-b-[2.5px] border-ink ${style.dot}`} />
          <div className="flex flex-col gap-4 p-5 sm:p-7">
            {header}
            <h1 className="text-4xl font-medium">ถึงตาคุณคิดโจทย์!</h1>
            <p className="text-[16px] text-ink-soft">
              ทุกคนรวมถึงคุณจะตอบคนละ 3 คำ โจทย์ที่ดีมีคำตอบยอดฮิตอยู่ไม่กี่คำ แต่ก็มีทางเลือกให้คิดต่างได้
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-display text-lg">โจทย์</span>
              <textarea
                className="field min-h-24 resize-none font-display !text-2xl"
                value={text}
                maxLength={max}
                autoFocus
                placeholder={`เช่น ${placeholder}`}
                onChange={(e) => setText(e.target.value.replace(/\n/g, ''))}
              />
              <span className="self-end text-sm text-ink-soft">
                {[...text].length}/{max}
              </span>
            </label>
            <Button tone="pink" size="lg" disabled={text.trim().length < 2 || sending} onClick={() => setConfirming(true)}>
              ยืนยันโจทย์
            </Button>
          </div>
        </motion.section>
        <Modal open={confirming} title="ใช้โจทย์นี้เลยนะ?" onClose={() => setConfirming(false)}>
          <p className="mb-2 font-display text-2xl">“{text.trim()}”</p>
          <p className="mb-5 text-ink-soft">ยืนยันแล้วแก้ไม่ได้ เพื่อนทุกคนจะเห็นโจทย์นี้พร้อมกัน</p>
          <div className="flex justify-end gap-3">
            <Button tone="paper" onClick={() => setConfirming(false)}>
              แก้อีกนิด
            </Button>
            <Button
              tone="pink"
              disabled={sending}
              onClick={async () => {
                setConfirming(false);
                setSending(true);
                await actions.submitQuestion(text);
                setSending(false);
              }}
            >
              ยืนยันโจทย์
            </Button>
          </div>
        </Modal>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-10 text-center">
      {header}
      <div className="relative">
        {author && (
          <motion.div
            animate={{ y: [0, -10, 0], rotate: [0, -4, 4, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Avatar name={author.name} color={author.color} size={96} dim={!author.connected} />
          </motion.div>
        )}
        <motion.span
          className="absolute -top-3 -right-8 rounded-2xl border-[2.5px] border-ink bg-paper px-3 py-1 font-display text-2xl shadow-chunk-sm"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          aria-hidden
        >
          …
        </motion.span>
      </div>
      <h1 className="text-3xl font-medium sm:text-4xl" aria-live="polite">
        กำลังรอ {author?.name ?? 'เพื่อน'} คิดโจทย์...
      </h1>
      {author && !author.connected && (
        <p className="text-[15px] text-danger">{author.name} หลุดอยู่ ถ้าไม่กลับมาเร็ว ๆ นี้จะสุ่มคนใหม่ให้อัตโนมัติ</p>
      )}
      {room.you.isHost && (
        <Button tone="paper" size="sm" onClick={() => void actions.rerollAuthor()}>
          สุ่มคนคิดโจทย์ใหม่
        </Button>
      )}
      {room.topics.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 text-[14px]">
          {room.topics.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5">
              <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${topicStyle(i).dot}`} />
              {t.question}
            </span>
          ))}
        </div>
      )}
    </main>
  );
}
