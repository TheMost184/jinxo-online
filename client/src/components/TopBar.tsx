import { useState } from 'react';
import { useGame, useRoom } from '../hooks/useGame';
import { Logo } from './Logo';
import { Button, Modal } from './ui';

const PHASE_LABEL: Record<string, string> = {
  lobby: 'ห้องรอ',
  answering: 'ตอบคำถาม',
  reveal: 'เปิดคำตอบ',
  review: 'ตรวจคำตอบ',
  roundResult: 'สรุปรอบ',
  finalResult: 'จบเกม',
};

export function TopBar() {
  const room = useRoom();
  const { actions, connection } = useGame();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inGame = room.phase !== 'lobby' && room.phase !== 'finalResult';

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pt-4 pb-2">
      <Logo size="sm" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span className="rounded-lg bg-paper/70 px-2 py-0.5 font-display tracking-[0.15em] text-ink">{room.code}</span>
        {inGame && (
          <span className="font-display text-ink">
            รอบ {room.roundIndex + 1}/{room.config.game.rounds}
          </span>
        )}
        <span>{PHASE_LABEL[room.phase]}</span>
        {connection !== 'online' && <span className="font-medium text-danger">กำลังเชื่อมต่อใหม่…</span>}
      </div>
      <Button tone="paper" size="sm" onClick={() => setConfirmLeave(true)}>
        ออกจากห้อง
      </Button>
      <Modal open={confirmLeave} title="ออกจากห้อง?" onClose={() => setConfirmLeave(false)}>
        <p className="mb-5 text-ink-soft">
          {inGame
            ? 'ถ้าออกตอนนี้จะกลับเข้าเกมนี้ไม่ได้ เพื่อน ๆ จะเล่นต่อโดยไม่มีคุณ'
            : 'คุณจะออกจากห้องรอ เข้ามาใหม่ได้ด้วยรหัสห้องเดิม'}
        </p>
        <div className="flex justify-end gap-3">
          <Button tone="paper" onClick={() => setConfirmLeave(false)}>
            อยู่ต่อ
          </Button>
          <Button tone="pink" onClick={() => void actions.leaveRoom()}>
            ออกจากห้อง
          </Button>
        </div>
      </Modal>
    </header>
  );
}
