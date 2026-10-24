import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Placement } from '@jinxo/shared';
import { gameConfig, scoringConfig } from '../src/config.js';
import { QuestionBank } from '../src/questions/questionBank.js';
import { Room } from '../src/rooms/Room.js';
import { GameError } from '../src/utils/errors.js';

const questions = QuestionBank.fromFiles();

function setup(n = 3) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const room = new Room('TEST01', { config: gameConfig, scoring: scoringConfig, questions }, () => now);
  const ids = Array.from({ length: n }, (_, i) => {
    const p = room.addPlayer(`P${i + 1}`);
    room.attachSocket(p.id, `s${i}`);
    return p.id;
  });
  return { room, ids, clock };
}

function expectCode(fn: () => void, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code);
}

/** วางคำตอบ 3 คำในช่องว่างช่องแรก ๆ */
function place(room: Room, id: string, words: string[]): Placement[] {
  const board = room.viewFor(id).myBoard;
  const empty = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  return words.map((text, i) => ({ cellIndex: empty[i], text }));
}

test('คำถามเริ่มต้นมีอย่างน้อย 100 ข้อ และครบ 7 หมวด', () => {
  assert.ok(questions.questions.length >= 100);
  assert.equal(questions.categories.length, 7);
});

test('lobby: ชื่อซ้ำ, ห้องเต็ม, host คนแรก, เริ่มเกมต้องมี 3 คน', () => {
  const { room, ids } = setup(2);
  assert.equal(room.hostId, ids[0]);
  expectCode(() => room.addPlayer('p1'), 'NAME_TAKEN');
  expectCode(() => room.start(ids[1]), 'NOT_HOST');
  expectCode(() => room.start(ids[0]), 'NOT_ENOUGH_PLAYERS');
  for (let i = 3; i <= gameConfig.maxPlayers; i++) room.attachSocket(room.addPlayer(`P${i}`).id, `x${i}`);
  expectCode(() => room.addPlayer('Extra'), 'ROOM_FULL');
});

test('เล่นครบ 1 เกม: ตอบ → reveal → review → คะแนน → final → play again', () => {
  const { room, ids } = setup(3);
  room.start(ids[0]);
  assert.equal(room.phase, 'answering');
  expectCode(() => room.addPlayer('Late'), 'GAME_IN_PROGRESS');

  for (let round = 0; round < gameConfig.rounds; round++) {
    for (let t = 0; t < gameConfig.topicsPerRound; t++) {
      // ก่อนตอบ ผู้เล่นเห็นเฉพาะหัวข้อที่เปิดแล้ว
      assert.equal(room.viewFor(ids[1]).topics.length, t + 1);
      room.submitAnswers(ids[0], place(room, ids[0], [`a${t}`, `b${t}`, `x${t}`]));
      expectCode(() => room.submitAnswers(ids[0], place(room, ids[0], ['q', 'w', 'e'])), 'ALREADY_SUBMITTED');
      // P1 ตอบแล้ว แต่คนอื่นยังมองไม่เห็นคำตอบของ P1 (ไม่มีข้อมูล reveal)
      assert.equal(room.viewFor(ids[1]).reveal, null);
      room.submitAnswers(ids[1], place(room, ids[1], [`a${t}`, `b${t}`, `y${t}`]));
      room.submitAnswers(ids[2], place(room, ids[2], [`a${t}`, `z${t}`, `w${t}`]));
    }
    assert.equal(room.phase, 'reveal');
    const v = room.viewFor(ids[0]).reveal!;
    assert.ok(v.boards.every((b) => b.cells.every((c) => c.state === 'hidden')));
    room.revealNext(ids[0]);
    const v2 = room.viewFor(ids[2]).reveal!;
    assert.equal(v2.revealedSteps, 1);
    assert.ok(v2.groups.length >= 1);
    room.revealAll(ids[0]);
    assert.equal(room.phase, 'review');

    // รวม x0 กับ y0 เป็นคำเดียวกัน → กลายเป็น JinxO
    const groups = room.viewFor(ids[0]).reveal!.groups;
    const x = groups.find((g) => g.label === 'x0')!;
    const y = groups.find((g) => g.label === 'y0')!;
    expectCode(() => room.mergeGroups(ids[1], 0, [x.id, y.id]), 'NOT_HOST');
    room.mergeGroups(ids[0], 0, [x.id, y.id]);
    const mergedGroup = room.viewFor(ids[0]).reveal!.groups.find((g) => g.id === x.id)!;
    assert.equal(mergedGroup.playerCount, 2);
    assert.equal(mergedGroup.kind, 'jinxo');
    room.splitGroup(ids[0], x.id);
    room.mergeGroups(ids[0], 0, [x.id, y.id]);

    room.finalizeRound(ids[0]);
    assert.equal(room.phase, 'roundResult');
    const res = room.viewFor(ids[0]).roundResult!;
    const s1 = res.scores.find((s) => s.playerId === ids[0])!;
    // a* ตรง 3 คน (1×3) + b* JinxO (2×3) + x0/y0 JinxO (2) = 3 + 6 + 2 = 11 + โบนัสตามตำแหน่ง
    assert.equal(s1.basePoints, 11);
    room.nextRound(ids[0]);
  }
  assert.equal(room.phase, 'finalResult');
  const final = room.viewFor(ids[0]).final!;
  assert.equal(final.standings.length, 3);
  assert.ok(final.winnerIds.length >= 1);
  room.playAgain(ids[0]);
  assert.equal(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.totalScore === 0));
});

test('validation คำตอบ: ซ้ำในกระดาน, ช่องทับ, ไม่ครบ, ยาวเกิน', () => {
  const { room, ids } = setup(3);
  room.start(ids[0]);
  const id = ids[0];
  expectCode(() => room.submitAnswers(id, [{ cellIndex: 0, text: 'a' }]), 'INVALID_PAYLOAD');
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'Cat' }, { cellIndex: 1, text: ' cat ' }, { cellIndex: 2, text: 'x' }]),
    'DUPLICATE_ANSWER',
  );
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'a' }, { cellIndex: 0, text: 'b' }, { cellIndex: 2, text: 'c' }]),
    'CELL_TAKEN',
  );
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'a' }, { cellIndex: 1, text: '   ' }, { cellIndex: 2, text: 'c' }]),
    'INVALID_PAYLOAD',
  );
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'a'.repeat(99) }, { cellIndex: 1, text: 'b' }, { cellIndex: 9, text: 'c' }]),
    'INVALID_PAYLOAD',
  );
  room.submitAnswers(id, [{ cellIndex: 0, text: 'แมว' }, { cellIndex: 4, text: 'หมา' }, { cellIndex: 8, text: 'ปลา' }]);
  // หัวข้อถัดไป ห้ามตอบซ้ำคำเดิมจากหัวข้อก่อน และห้ามวางทับช่องเดิม
  room.submitAnswers(ids[1], place(room, ids[1], ['1', '2', '3']));
  room.submitAnswers(ids[2], place(room, ids[2], ['1', '2', '3']));
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 1, text: 'แมว' }, { cellIndex: 2, text: 'b' }, { cellIndex: 3, text: 'c' }]),
    'DUPLICATE_ANSWER',
  );
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'z' }, { cellIndex: 2, text: 'b' }, { cellIndex: 3, text: 'c' }]),
    'CELL_TAKEN',
  );
});

test('disconnect: รอช่วงผ่อนผันก่อน แล้วเกมเดินต่อ, กลับมาตอบต่อได้', () => {
  const { room, ids, clock } = setup(3);
  room.start(ids[0]);
  room.detachSocket('s2'); // P3 หลุด
  room.submitAnswers(ids[0], place(room, ids[0], ['a', 'b', 'c']));
  room.submitAnswers(ids[1], place(room, ids[1], ['a', 'b', 'd']));
  assert.equal(room.viewFor(ids[0]).currentTopicIndex, 0); // ยังรอ P3
  clock.advance(gameConfig.disconnectGraceMs + 10);
  assert.ok(room.tick());
  assert.equal(room.viewFor(ids[0]).currentTopicIndex, 1); // ข้าม P3 แล้ว
  // P3 กลับมา → ต้องตอบหัวข้อ 2 ได้
  room.attachSocket(ids[2], 's2b');
  assert.equal(room.viewFor(ids[0]).requiredCount, 3);
  room.submitAnswers(ids[2], place(room, ids[2], ['e', 'f', 'g']));
  assert.equal(room.viewFor(ids[2]).myBoard.filter(Boolean).length, 3);
});

test('host หลุดเกินเวลา → โอน host, host กดออก → โอนทันที', () => {
  const { room, ids, clock } = setup(3);
  room.detachSocket('s0');
  clock.advance(gameConfig.hostTransferGraceMs - 100);
  room.tick();
  assert.equal(room.hostId, ids[0]);
  clock.advance(200);
  room.tick();
  assert.equal(room.hostId, ids[1]);
  room.leave(ids[1]);
  assert.equal(room.hostId, ids[2]);
});

test('host กด skip waiting สำหรับคน AFK', () => {
  const { room, ids } = setup(3);
  room.start(ids[0]);
  room.submitAnswers(ids[0], place(room, ids[0], ['a', 'b', 'c']));
  expectCode(() => room.skipWaiting(ids[1]), 'NOT_HOST');
  room.skipWaiting(ids[0]);
  assert.equal(room.viewFor(ids[0]).currentTopicIndex, 1);
});

test('ไม่สุ่มคำถามซ้ำในเกมเดียวกัน และ host เลือกหมวดได้', () => {
  const { room, ids } = setup(3);
  room.setCategories(ids[0], ['food']);
  expectCode(() => room.setCategories(ids[0], ['nope']), 'INVALID_PAYLOAD');
  room.start(ids[0]);
  const seen = new Set<number>();
  for (let r = 0; r < gameConfig.rounds; r++) {
    for (let t = 0; t < gameConfig.topicsPerRound; t++) {
      for (const id of ids) room.submitAnswers(id, place(room, id, [`${id}a${t}`, `${id}b${t}`, `${id}c${t}`]));
    }
    for (const topic of room.viewFor(ids[0]).topics) {
      assert.equal(topic.category, 'food');
      assert.ok(!seen.has(topic.id), 'คำถามซ้ำ');
      seen.add(topic.id);
    }
    room.revealAll(ids[0]);
    room.finalizeRound(ids[0]);
    room.nextRound(ids[0]);
  }
  assert.equal(seen.size, 9);
});
