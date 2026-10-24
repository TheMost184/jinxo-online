import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Board, PublicScoringConfig, RevealCell } from '@jinxo/shared';
import { RevealEngine } from '../src/game/reveal.js';
import { GameError } from '../src/utils/errors.js';

const config: PublicScoringConfig = {
  tiers: [
    { minPlayers: 1, maxPlayers: 1, points: 0, kind: 'none' },
    { minPlayers: 2, maxPlayers: 2, points: 2, kind: 'jinxo' },
    { minPlayers: 3, points: 1, kind: 'match' },
  ],
  lineBonus: { enabled: true, condition: 'matched', rows: [1, 2, 3], columns: [3, 2, 1], diagonals: [0, 0] },
};

/** กระดาน 9 ช่อง: [คำ, หัวข้อ] หรือ null */
function board(cells: ([string, number] | null)[]): Board {
  const b = cells.map((c) => (c ? { text: c[0], topicIndex: c[1] } : null));
  while (b.length < 9) b.push(null);
  return b;
}

function expectCode(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code, `ควร error ${code}`);
}

const shown = (c: RevealCell) => (c.state === 'shown' ? c.answer : null);

/**
 * Mint: กรุงเทพ(0) หมา(0) x(0)
 * Most: กทม.(0)   หมา(0) y(0)
 * Beam: กรุงเทพมหานคร(0) แมว(0) z(0)
 */
function setup(order = ['mint', 'most', 'beam']) {
  const boards = new Map<string, Board>([
    ['mint', board([['กรุงเทพ', 0], ['หมา', 0], ['x', 0]])],
    ['most', board([['กทม.', 0], ['หมา', 0], ['y', 0]])],
    ['beam', board([['กรุงเทพมหานคร', 0], ['แมว', 0], ['z', 0]])],
  ]);
  return new RevealEngine(boards, order, config);
}

test('เปิดทีละช่องตามลำดับ และคำที่ยังไม่เปิดไม่รั่วออกไปใน view', () => {
  const e = setup();
  const v0 = e.publicView();
  assert.deepEqual(v0.order, ['mint', 'most', 'beam']);
  assert.ok(v0.boards.every((b) => b.cells.every((c) => c.state !== 'shown')));
  assert.ok(!JSON.stringify(v0).includes('กรุงเทพ'));
  e.revealNextAnswer();
  const v1 = e.publicView();
  assert.equal(shown(v1.boards[0].cells[0])?.text, 'กรุงเทพ');
  assert.equal(v1.focusAnswerId, 'mint:0');
  assert.ok(!JSON.stringify(v1).includes('กทม'), 'คำของ Most ยังไม่ควรถูกส่ง');
});

test('คำที่ตรงกันเป๊ะเปิดอัตโนมัติ (MATCHED) และถูกข้ามตอนถึงตาเจ้าของ', () => {
  const e = setup();
  e.revealNextAnswer(); // mint:0 กรุงเทพ
  e.revealNextAnswer(); // mint:1 หมา → most:1 หมา เปิดด้วย
  const most = e.boardView('most');
  const dog = shown(most.cells[1])!;
  assert.equal(dog.text, 'หมา');
  assert.equal(dog.revealedBy, 'match');
  assert.equal(dog.kind, 'jinxo');
  assert.equal(dog.points, 2);
  e.revealNextAnswer(); // mint:2
  expectCode(() => e.revealNextAnswer(), 'NOTHING_TO_REVEAL');
  assert.equal(e.nextPlayer(), 'next');
  // ตา Most: ช่อง "หมา" เปิดค้างไว้แล้ว ต้องเปิดแค่ กทม. กับ y
  assert.deepEqual(e.hiddenOf('most').map((a) => a.text), ['กทม.', 'y']);
});

test('Match Request: อนุมัติแล้วคะแนนคิดใหม่ทั้งกลุ่ม 2 คน → 3 คน (2 แต้ม → 1 แต้ม)', () => {
  const e = setup();
  e.revealNextAnswer(); // กรุงเทพ
  e.requestMatch('most', 'mint:0', 0); // กทม.
  e.decide('m1', true);
  let mint = shown(e.boardView('mint').cells[0])!;
  assert.equal(mint.groupSize, 2);
  assert.equal(mint.points, 2);
  // กทม. ของ Most ถูกเปิดเพราะจับคู่แล้ว
  assert.equal(shown(e.boardView('most').cells[0])?.revealedBy, 'match');
  e.requestMatch('beam', 'mint:0', 0); // กรุงเทพมหานคร
  e.decide('m2', true);
  mint = shown(e.boardView('mint').cells[0])!;
  const most = shown(e.boardView('most').cells[0])!;
  const beam = shown(e.boardView('beam').cells[0])!;
  assert.deepEqual([mint.points, most.points, beam.points], [1, 1, 1]);
  assert.equal(mint.kind, 'match');
  // ค่า full score ตรงกับที่โชว์ (ไม่มีคะแนนค้างจากการอนุมัติครั้งแรก)
  assert.equal(e.fullScores().get('mint')!.cells[0]!.points, 1);
  const g = e.publicView().groups.find((x) => x.id === mint.groupId)!;
  assert.deepEqual(new Set(g.variants), new Set(['กรุงเทพ', 'กทม.', 'กรุงเทพมหานคร']));
});

test('Anti-spam: ซ้ำ, เกิน 1 คำต่อคำที่เปิด, คำตัวเอง, ช่องว่าง, คำที่ผ่านไปแล้ว, มีในกลุ่มอยู่แล้ว', () => {
  const e = setup();
  e.revealNextAnswer(); // mint:0 กรุงเทพ
  e.requestMatch('most', 'mint:0', 0);
  expectCode(() => e.requestMatch('most', 'mint:0', 0), 'DUPLICATE_REQUEST');
  expectCode(() => e.requestMatch('most', 'mint:0', 2), 'DUPLICATE_REQUEST'); // คำที่ 2 สำหรับคำเดียวกัน
  expectCode(() => e.requestMatch('mint', 'mint:0', 1), 'OWN_ANSWER');
  expectCode(() => e.requestMatch('beam', 'mint:0', 7), 'INVALID_MATCH'); // ช่องว่าง
  expectCode(() => e.requestMatch('ghost', 'mint:0', 0), 'NOT_A_PLAYER');
  // คิวยังรอ → เปิดคำถัดไปไม่ได้ (request ไม่มีทางหาย)
  expectCode(() => e.revealNextAnswer(), 'PENDING_REQUESTS');
  e.decide('m1', false);
  // ถูก reject ก็ส่งซ้ำไม่ได้
  expectCode(() => e.requestMatch('most', 'mint:0', 0), 'DUPLICATE_REQUEST');
  e.revealNextAnswer(); // mint:1 หมา (most มีหมาอยู่แล้ว)
  expectCode(() => e.requestMatch('beam', 'mint:0', 0), 'STALE_TARGET');
  expectCode(() => e.requestMatch('most', 'mint:1', 2), 'INVALID_MATCH'); // most มีคำในกลุ่มนี้แล้ว
});

test('Host ตัดสินตามคิว, อนุมัติซ้ำไม่ได้และไม่นับซ้ำ, ยกเลิกได้', () => {
  const e = setup();
  e.revealNextAnswer();
  e.requestMatch('most', 'mint:0', 0);
  e.requestMatch('beam', 'mint:0', 0);
  expectCode(() => e.decide('m2', true), 'INVALID_PAYLOAD'); // ต้องตัดสิน m1 ก่อน
  e.decide('m1', true);
  expectCode(() => e.decide('m1', true), 'ALREADY_DECIDED');
  assert.equal(shown(e.boardView('mint').cells[0])!.points, 2);
  e.decide('m2', true);
  assert.equal(shown(e.boardView('mint').cells[0])!.points, 1);
  e.undo('m2');
  assert.equal(shown(e.boardView('mint').cells[0])!.points, 2);
  assert.equal(shown(e.boardView('beam').cells[0])!.points, 0); // ยังเปิดอยู่ แต่ไม่ตรงแล้ว
});

test('Like: ผูกกับ answer id, ห้าม like ตัวเอง, ห้าม like คำที่ยังไม่เปิด, unlike ได้, ไม่กระทบคะแนน', () => {
  const e = setup();
  e.revealNextAnswer(); // mint:0
  e.revealNextAnswer(); // mint:1 หมา + most:1 หมา
  expectCode(() => e.setLike('mint', 'mint:0', true), 'OWN_ANSWER');
  expectCode(() => e.setLike('most', 'mint:2', true), 'NOT_REVEALED');
  e.setLike('most', 'mint:1', true);
  e.setLike('most', 'mint:1', true); // กดซ้ำไม่นับเพิ่ม
  e.setLike('beam', 'mint:1', true);
  e.setLike('beam', 'most:1', true); // คำเดียวกันแต่คนละเจ้าของ นับแยก
  assert.equal(e.likeCount('mint:1'), 2);
  assert.equal(e.likeCount('most:1'), 1);
  e.setLike('beam', 'mint:1', false);
  assert.equal(e.likeCount('mint:1'), 1);
  assert.deepEqual(e.likedBy('beam'), ['most:1']);
  const before = e.fullScores().get('mint')!.basePoints;
  e.setLike('beam', 'mint:0', true);
  assert.equal(e.fullScores().get('mint')!.basePoints, before);
});

test('คนสุดท้าย: คำที่ข้ามเพราะจับคู่แล้วยังกด Like ได้ และยังส่ง Match Request ได้', () => {
  const e = setup(['mint', 'most', 'beam']);
  e.revealNextAnswer();
  e.revealNextAnswer();
  e.revealNextAnswer();
  e.nextPlayer();
  e.revealNextAnswer(); // กทม.
  e.revealNextAnswer(); // y
  e.nextPlayer();
  // ตา Beam (คนสุดท้าย)
  assert.equal(e.isLastPlayer, true);
  e.revealNextAnswer(); // กรุงเทพมหานคร
  e.requestMatch('mint', 'beam:0', 0);
  e.decide('m1', true);
  e.setLike('mint', 'beam:0', true);
  e.revealNextAnswer();
  e.revealNextAnswer();
  assert.equal(e.nextPlayer(), 'done');
  assert.equal(e.likeCount('beam:0'), 1);
  assert.equal(shown(e.boardView('beam').cells[0])!.points, 2);
});

test('โบนัสแถวคำนวณใหม่เมื่อกลุ่มเปลี่ยน', () => {
  const boards = new Map<string, Board>([
    ['a', board([['p', 0], ['q', 1], ['r', 2]])],
    ['b', board([['p', 0], ['q', 1], ['ร', 2]])],
    ['c', board([['zz', 0]])],
  ]);
  const e = new RevealEngine(boards, ['a', 'b', 'c'], config);
  e.revealNextAnswer();
  e.revealNextAnswer();
  e.revealNextAnswer(); // a:2 'r'
  assert.equal(e.boardView('a').bonusPoints, 0);
  e.requestMatch('b', 'a:2', 2); // 'ร'
  e.decide('m1', true);
  const a = e.boardView('a');
  assert.deepEqual(a.bonusLines, ['r0']);
  assert.equal(a.points, 2 + 2 + 2 + 1);
  assert.equal(e.boardView('b').points, 7);
});

test('Top 3 matched นับคนไม่ซ้ำ และ Top 3 liked เสมอกันเรียงตามลำดับที่เปิด', () => {
  const boards = new Map<string, Board>([
    ['a', board([['แมว', 0], ['พิซซ่า', 1], ['ส้ม', 2]])],
    ['b', board([['แมว', 0], ['พิซซ่า', 1], ['มะม่วง', 2]])],
    ['c', board([['แมว', 0], ['ข้าว', 1], ['มะม่วง', 2]])],
    ['d', board([['หมา', 0], ['ข้าว', 1], ['องุ่น', 2]])],
  ]);
  const e = new RevealEngine(boards, ['a', 'b', 'c', 'd'], config);
  for (const pid of ['a', 'b', 'c', 'd']) {
    while (e.hiddenOf(pid).length) e.revealNextAnswer();
    if (pid !== 'd') e.nextPlayer();
  }
  const top = e.topMatched();
  assert.equal(top[0].label, 'แมว');
  assert.equal(top[0].size, 3);
  assert.deepEqual(top.map((t) => t.size), [3, 2, 2]);
  e.setLike('b', 'a:2', true);
  e.setLike('c', 'a:2', true);
  e.setLike('a', 'd:2', true);
  e.setLike('a', 'c:1', true);
  const liked = e.topLiked();
  assert.deepEqual(liked.map((l) => [l.answerId, l.likes, l.rank]), [
    ['a:2', 2, 1],
    ['c:1', 1, 2], // c:1 เปิดก่อน d:2
    ['d:2', 1, 2],
  ]);
});
