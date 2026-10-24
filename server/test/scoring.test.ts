import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, type Board, type PublicScoringConfig } from '@jinxo/shared';
import { buildGroups, rank, scoreRound, tierFor } from '../src/game/scoring.js';
import { buildRevealSteps } from '../src/game/reveal.js';

const config: PublicScoringConfig = {
  tiers: [
    { minPlayers: 1, maxPlayers: 1, points: 0, kind: 'none' },
    { minPlayers: 2, maxPlayers: 2, points: 2, kind: 'jinxo' },
    { minPlayers: 3, points: 1, kind: 'match' },
  ],
  lineBonus: { enabled: true, condition: 'matched', rows: [1, 2, 3], columns: [3, 2, 1], diagonals: [0, 0] },
};

/** สร้างกระดานจาก [ข้อความ, หัวข้อ] 9 ช่อง (null = ว่าง) */
function board(cells: ([string, number] | null)[]): Board {
  return cells.map((c) => (c ? { text: c[0], topicIndex: c[1] } : null));
}

test('normalize: case, ช่องว่าง, ไทยเว้นวรรค, เครื่องหมายหัวท้าย', () => {
  assert.equal(normalizeAnswer('  Apple  '), 'apple');
  assert.equal(normalizeAnswer('APPLE pie'), 'apple pie');
  assert.equal(normalizeAnswer('ไก่  ทอด'), 'ไก่ทอด');
  assert.equal(normalizeAnswer('แมว!'), 'แมว');
  assert.equal(normalizeAnswer('ห​มู'), 'หมู');
  // สะกดต่างกันต้องไม่ถูกนับว่าตรงกันอัตโนมัติ
  assert.notEqual(normalizeAnswer('หมู'), normalizeAnswer('สุกร'));
  assert.notEqual(normalizeAnswer('แอปเปิ้ล'), normalizeAnswer('แอปเปิล'));
});

test('tierFor: 1 คน = 0, 2 คน = JinxO 2 แต้ม, 3+ = 1 แต้ม', () => {
  assert.deepEqual(tierFor(1, config), { points: 0, kind: 'none' });
  assert.deepEqual(tierFor(2, config), { points: 2, kind: 'jinxo' });
  assert.deepEqual(tierFor(3, config), { points: 1, kind: 'match' });
  assert.deepEqual(tierFor(7, config), { points: 1, kind: 'match' });
});

test('คะแนนพื้นฐาน: เทียบเฉพาะในหัวข้อเดียวกัน', () => {
  const boards = new Map<string, Board>([
    ['A', board([['แอปเปิ้ล', 0], ['ส้ม', 1], null, null, null, null, null, null, null])],
    ['B', board([['Apple', 0], ['แอปเปิ้ล', 0], ['ส้ม', 0], null, null, null, null, null, null])],
    ['C', board([['แอปเปิ้ล', 0], null, null, null, null, null, null, null, null])],
  ]);
  const s = scoreRound(boards, new Map(), config);
  // "แอปเปิ้ล" หัวข้อ 0: A, B, C = 3 คน → 1 แต้ม/คน
  assert.equal(s.get('A')!.basePoints, 1); // ส้มของ A อยู่หัวข้อ 1 ไม่ตรงกับส้มของ B (หัวข้อ 0)
  assert.equal(s.get('B')!.basePoints, 1);
  assert.equal(s.get('C')!.basePoints, 1);
});

test('JinxO และการรวมคำพ้องของ Host', () => {
  const boards = new Map<string, Board>([
    ['A', board([['หมู', 0], null, null, null, null, null, null, null, null])],
    ['B', board([['สุกร', 0], null, null, null, null, null, null, null, null])],
    ['C', board([['วัว', 0], null, null, null, null, null, null, null, null])],
  ]);
  assert.equal(scoreRound(boards, new Map(), config).get('A')!.basePoints, 0);
  const merged = new Map([['0|สุกร', '0|หมู']]);
  const s = scoreRound(boards, merged, config);
  assert.equal(s.get('A')!.basePoints, 2);
  assert.equal(s.get('B')!.basePoints, 2);
  assert.equal(s.get('A')!.jinxoCount, 1);
  assert.equal(s.get('C')!.basePoints, 0);
});

test('โบนัสแถว/คอลัมน์: ได้เมื่อทั้ง 3 ช่องตรงกับคนอื่น', () => {
  // A กับ B ตอบเหมือนกันทั้งกระดาน แต่ B วางคนละช่อง
  const words: [string, number][] = [
    ['a', 0], ['b', 0], ['c', 0],
    ['d', 1], ['e', 1], ['f', 1],
    ['g', 2], ['h', 2], ['i', 2],
  ];
  const boards = new Map<string, Board>([
    ['A', board(words)],
    ['B', board([...words].reverse())],
    ['C', board([['x', 0], ['y', 0], ['z', 0], null, null, null, null, null, null])],
  ]);
  const s = scoreRound(boards, new Map(), config);
  const a = s.get('A')!;
  assert.equal(a.basePoints, 18); // 9 ช่อง × JinxO 2 แต้ม
  // ทุกแถว (1+2+3) + ทุกคอลัมน์ (3+2+1) = 12, แนวทแยงตั้งไว้ 0
  assert.equal(a.bonusPoints, 12);
  assert.deepEqual(a.bonusLines.sort(), ['c0', 'c1', 'c2', 'r0', 'r1', 'r2']);
  // C ไม่ตรงใครเลย
  assert.equal(s.get('C')!.basePoints + s.get('C')!.bonusPoints, 0);
});

test('โบนัส: ช่องว่างหรือคำที่ไม่ตรงใคร ทำให้ไม่ได้โบนัสแนวนั้น', () => {
  const boards = new Map<string, Board>([
    ['A', board([['a', 0], ['b', 0], ['c', 0], null, null, null, null, null, null])],
    ['B', board([['a', 0], ['b', 0], ['q', 0], null, null, null, null, null, null])],
  ]);
  const s = scoreRound(boards, new Map(), config);
  assert.equal(s.get('A')!.basePoints, 4);
  assert.equal(s.get('A')!.bonusPoints, 0);
});

test('เงื่อนไขโบนัสแบบ jinxo: แนวที่มีคำตรงกัน 3 คนไม่นับ', () => {
  const cfg: PublicScoringConfig = { ...config, lineBonus: { ...config.lineBonus, condition: 'jinxo' } };
  const row: ([string, number] | null)[] = [['a', 0], ['b', 0], ['c', 0], null, null, null, null, null, null];
  const boards = new Map<string, Board>([
    ['A', board(row)],
    ['B', board(row)],
    ['C', board([['a', 0], null, null, null, null, null, null, null, null])],
  ]);
  const s = scoreRound(boards, new Map(), cfg);
  assert.equal(s.get('A')!.bonusPoints, 0); // 'a' ตรงกัน 3 คน ไม่ใช่ JinxO
  assert.equal(s.get('A')!.basePoints, 1 + 2 + 2);
});

test('rank: คะแนนเท่ากันได้อันดับเดียวกัน', () => {
  const r = rank([{ n: 'a', s: 5 }, { n: 'b', s: 9 }, { n: 'c', s: 5 }, { n: 'd', s: 1 }], (x) => x.s);
  assert.deepEqual(r.map((x) => [x.item.n, x.rank]), [['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
});

test('reveal steps: กลุ่มที่ตรงกันเปิดทีละกลุ่ม แล้วตามด้วยคำที่ไม่ตรงใคร', () => {
  const boards = new Map<string, Board>([
    ['A', board([['a', 0], ['b', 0], ['u1', 0], ['d', 1], null, null, null, null, null])],
    ['B', board([['a', 0], ['b', 0], ['u2', 0], ['d', 1], null, null, null, null, null])],
    ['C', board([['a', 0], ['u3', 0], null, ['e', 1], null, null, null, null, null])],
  ]);
  const steps = buildRevealSteps(buildGroups(boards), 3);
  assert.deepEqual(
    steps.map((s) => [s.topicIndex, s.kind, s.groupIds.length]),
    [
      [0, 'group', 1], // b (2 คน) ก่อน
      [0, 'group', 1], // a (3 คน) เป็นไคลแม็กซ์
      [0, 'unmatched', 3],
      [1, 'group', 1],
      [1, 'unmatched', 1],
    ],
  );
  assert.equal(steps[0].groupIds[0], '0|b');
});
