import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_CATEGORY_ID, type Placement } from '@jinxo/shared';
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
  assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code, `ควร error ${code}`);
}

/** วางคำตอบ 3 คำในช่องว่างช่องแรก ๆ */
function place(room: Room, id: string, words: string[]): Placement[] {
  const board = room.viewFor(id).myBoard;
  const empty = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  return words.map((text, i) => ({ cellIndex: empty[i], text }));
}

/** เปิดคำตอบทุกคนจนจบรอบ (ไม่มี match request) */
function revealAll(room: Room, hostId: string) {
  while (room.phase === 'reveal') {
    try {
      room.revealNextAnswer(hostId);
    } catch (e) {
      if (!(e instanceof GameError) || e.code !== 'NOTHING_TO_REVEAL') throw e;
      room.nextPlayer(hostId);
    }
  }
}

test('คำถามเริ่มต้นมีอย่างน้อย 100 ข้อ, 7 หมวด + หมวดคิดโจทย์เอง', () => {
  assert.ok(questions.questions.length >= 100);
  assert.equal(questions.categories.length, 7);
  const { room, ids } = setup(1);
  assert.ok(room.viewFor(ids[0]).categories.some((c) => c.id === CUSTOM_CATEGORY_ID && c.custom));
});

test('lobby: ชื่อซ้ำ, ห้องเต็ม 15 คน, host คนแรก, เริ่มเกมต้องมี 3 คน', () => {
  const { room, ids } = setup(2);
  assert.equal(gameConfig.maxPlayers, 15);
  assert.equal(room.hostId, ids[0]);
  expectCode(() => room.addPlayer('p1'), 'NAME_TAKEN');
  expectCode(() => room.start(ids[1]), 'NOT_HOST');
  expectCode(() => room.start(ids[0]), 'NOT_ENOUGH_PLAYERS');
  for (let i = 3; i <= 15; i++) room.attachSocket(room.addPlayer(`P${i}`).id, `x${i}`);
  expectCode(() => room.addPlayer('Extra'), 'ROOM_FULL');
});

test('Kick: เฉพาะ Host, เฉพาะ Lobby, เตะตัวเองไม่ได้, token เดิมใช้ไม่ได้, join ใหม่ได้', () => {
  const { room, ids } = setup(4);
  const victim = room.getPlayer(ids[2])!;
  const oldToken = victim.token;
  expectCode(() => room.kick(ids[1], ids[2]), 'NOT_HOST');
  expectCode(() => room.kick(ids[0], ids[0]), 'INVALID_PAYLOAD');
  const res = room.kick(ids[0], ids[2]);
  assert.equal(res.socketId, 's2');
  assert.equal(room.players.length, 3);
  expectCode(() => room.authenticate(ids[2], oldToken), 'KICKED');
  // กลับเข้าห้องใหม่ได้ด้วย session ใหม่ (ชื่อเดิมก็ได้)
  const again = room.addPlayer(victim.name);
  assert.notEqual(again.id, ids[2]);
  room.attachSocket(again.id, 's2b');
  room.start(ids[0]);
  expectCode(() => room.kick(ids[0], ids[1]), 'WRONG_PHASE');
});

test('หมวดคิดโจทย์เองใช้ร่วมกับหมวดอื่นไม่ได้', () => {
  const { room, ids } = setup(3);
  expectCode(() => room.setCategories(ids[0], [CUSTOM_CATEGORY_ID, 'food']), 'INVALID_PAYLOAD');
  room.setCategories(ids[0], [CUSTOM_CATEGORY_ID]);
  assert.equal(room.viewFor(ids[1]).customMode, true);
  room.setCategories(ids[0], ['food']);
  assert.equal(room.viewFor(ids[1]).customMode, false);
});

test('เล่นครบ 1 เกม: ตอบ → เปิดทีละคน → Round Summary → final → play again', () => {
  const { room, ids } = setup(3);
  room.start(ids[0]);
  assert.equal(room.phase, 'answering');
  expectCode(() => room.addPlayer('Late'), 'GAME_IN_PROGRESS');

  for (let round = 0; round < gameConfig.rounds; round++) {
    for (let t = 0; t < gameConfig.topicsPerRound; t++) {
      assert.equal(room.viewFor(ids[1]).topics.length, t + 1);
      room.submitAnswers(ids[0], place(room, ids[0], [`a${t}`, `b${t}`, `x${t}`]));
      expectCode(() => room.submitAnswers(ids[0], place(room, ids[0], ['q', 'w', 'e'])), 'ALREADY_SUBMITTED');
      assert.equal(room.viewFor(ids[1]).reveal, null);
      room.submitAnswers(ids[1], place(room, ids[1], [`a${t}`, `b${t}`, `y${t}`]));
      room.submitAnswers(ids[2], place(room, ids[2], [`a${t}`, `z${t}`, `w${t}`]));
    }
    assert.equal(room.phase, 'reveal');
    const v = room.viewFor(ids[0]).reveal!;
    assert.equal(new Set(v.order).size, 3);
    // ลำดับคงที่ตลอดการเปิด
    expectCode(() => room.revealNextAnswer(ids[1]), 'NOT_HOST');
    room.revealNextAnswer(ids[0]);
    assert.deepEqual(room.viewFor(ids[2]).reveal!.order, v.order);
    revealAll(room, ids[0]);
    assert.equal(room.phase, 'roundResult');
    const res = room.viewFor(ids[0]).roundResult!;
    const s1 = res.scores.find((s) => s.playerId === ids[0])!;
    // a* ตรง 3 คน (1×3) + b* JinxO (2×3) = 9 (+ โบนัสตามตำแหน่ง)
    assert.equal(s1.basePoints, 9);
    assert.equal(res.boards.length, 3);
    assert.ok(res.boards.every((b) => b.complete));
    assert.equal(res.topMatched[0].size, 3);
    room.nextRound(ids[0]);
  }
  assert.equal(room.phase, 'finalResult');
  const final = room.viewFor(ids[0]).final!;
  assert.equal(final.standings.length, 3);
  assert.ok(final.winnerIds.length >= 1);
  room.playAgain(ids[0]);
  assert.equal(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.totalScore === 0 && p.totalLikes === 0));
});

test('Like ไม่มีผลกับอันดับ แต่สะสมเป็น Popularity', () => {
  const { room, ids } = setup(3);
  room.start(ids[0]);
  for (let t = 0; t < 3; t++) for (const id of ids) room.submitAnswers(id, place(room, id, [`${id}${t}a`, `${id}${t}b`, `${id}${t}c`]));
  room.revealNextAnswer(ids[0]);
  const focus = room.viewFor(ids[0]).reveal!.focusAnswerId!;
  const owner = focus.split(':')[0];
  const others = ids.filter((x) => x !== owner);
  for (const o of others) room.setLike(o, focus, true);
  expectCode(() => room.setLike(owner, focus, true), 'OWN_ANSWER');
  assert.deepEqual(room.viewFor(others[0]).myLikes, [focus]);
  revealAll(room, ids[0]);
  const res = room.viewFor(ids[0]).roundResult!;
  assert.equal(res.topLiked[0].answerId, focus);
  assert.equal(res.topLiked[0].likes, 2);
  // ไม่มีใครตรงกันเลย = 0 แต้มทุกคน อันดับ 1 เท่ากันหมดแม้จะมีคนได้ Like
  assert.ok(res.scores.every((s) => s.rank === 1 && s.total === 0));
  assert.equal(res.scores.find((s) => s.playerId === owner)!.likes, 2);
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
    () => room.submitAnswers(id, [{ cellIndex: 0, text: 'a'.repeat(99) }, { cellIndex: 1, text: 'b' }, { cellIndex: 2, text: 'c' }]),
    'INVALID_PAYLOAD',
  );
  room.submitAnswers(id, [{ cellIndex: 0, text: 'แมว' }, { cellIndex: 4, text: 'หมา' }, { cellIndex: 8, text: 'ปลา' }]);
  room.submitAnswers(ids[1], place(room, ids[1], ['1', '2', '3']));
  room.submitAnswers(ids[2], place(room, ids[2], ['1', '2', '3']));
  expectCode(
    () => room.submitAnswers(id, [{ cellIndex: 1, text: 'แมว' }, { cellIndex: 2, text: 'b' }, { cellIndex: 3, text: 'c' }]),
    'DUPLICATE_ANSWER',
  );
});

test('disconnect ระหว่างตอบ: รอช่วงผ่อนผันก่อน แล้วเกมเดินต่อ, กลับมาตอบต่อได้', () => {
  const { room, ids, clock } = setup(3);
  room.start(ids[0]);
  room.detachSocket('s2');
  room.submitAnswers(ids[0], place(room, ids[0], ['a', 'b', 'c']));
  room.submitAnswers(ids[1], place(room, ids[1], ['a', 'b', 'd']));
  assert.equal(room.viewFor(ids[0]).currentTopicIndex, 0);
  clock.advance(gameConfig.disconnectGraceMs + 10);
  assert.ok(room.tick());
  assert.equal(room.viewFor(ids[0]).currentTopicIndex, 1);
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

test('โหมดคิดโจทย์เอง: สุ่มคนตั้งโจทย์ไม่ซ้ำจนครบทุกคน, คนตั้งตอบด้วย, 9 โจทย์ต่อเกม', () => {
  const { room, ids } = setup(3);
  room.setCategories(ids[0], [CUSTOM_CATEGORY_ID]);
  room.start(ids[0]);
  const authors: string[] = [];
  for (let r = 0; r < gameConfig.rounds; r++) {
    for (let t = 0; t < gameConfig.topicsPerRound; t++) {
      assert.equal(room.phase, 'authoring');
      const view = room.viewFor(ids[0]);
      const author = view.authoring!.authorId;
      // ยังไม่มีใครเห็นโจทย์ก่อนส่ง
      assert.equal(view.topics.length, t);
      const other = ids.find((x) => x !== author)!;
      expectCode(() => room.submitQuestion(other, 'แอบตั้งโจทย์'), 'NOT_AUTHOR');
      expectCode(() => room.submitQuestion(author, ' '), 'INVALID_PAYLOAD');
      room.submitQuestion(author, `โจทย์ ${r}-${t}`);
      expectCode(() => room.submitQuestion(author, 'แก้โจทย์'), 'WRONG_PHASE');
      authors.push(author);
      assert.equal(room.phase, 'answering');
      assert.equal(room.viewFor(other).topics[t].question, `โจทย์ ${r}-${t}`);
      assert.equal(room.viewFor(other).topics[t].authorId, author);
      for (const id of ids) room.submitAnswers(id, place(room, id, [`${id}${r}${t}a`, `${id}${r}${t}b`, `ตรง${r}${t}`]));
    }
    revealAll(room, ids[0]);
    room.nextRound(ids[0]);
  }
  assert.equal(authors.length, 9);
  // ทุก ๆ 3 โจทย์ ทุกคนได้ตั้งครบคนละครั้ง
  for (let i = 0; i < 9; i += 3) assert.equal(new Set(authors.slice(i, i + 3)).size, 3);
  assert.equal(room.phase, 'finalResult');
});

test('โหมดคิดโจทย์เอง: คนตั้งโจทย์หลุดเกินเวลา → สุ่มคนใหม่จากคนที่ออนไลน์, Host สุ่มใหม่ได้', () => {
  const { room, ids, clock } = setup(4);
  room.setCategories(ids[0], [CUSTOM_CATEGORY_ID]);
  room.start(ids[0]);
  const first = room.viewFor(ids[0]).authoring!.authorId;
  const sock = `s${ids.indexOf(first)}`;
  room.detachSocket(sock);
  clock.advance(gameConfig.disconnectGraceMs - 50);
  room.tick();
  assert.equal(room.viewFor(ids[0]).authoring!.authorId, first);
  clock.advance(100);
  assert.ok(room.tick());
  const second = room.viewFor(ids[0]).authoring!.authorId;
  assert.notEqual(second, first);
  assert.ok(room.getPlayer(second)!.connected);
  const host = room.hostId;
  room.rerollAuthor(host);
  assert.notEqual(room.viewFor(host).authoring!.authorId, second);
});
