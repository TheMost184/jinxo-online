/**
 * จำลองผู้เล่นจริงหลายคนผ่าน Socket.IO (เหมือนเปิดหลายแท็บ) แล้วเล่นครบเกม + ตรวจ edge cases
 * รัน: npm run test:sim
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, RoomView, ServerToClientEvents, SessionInfo } from '@jinxo/shared';

process.env.JINXO_GAME_CONFIG = 'test/fixtures/game.fast.json';
const { createJinxoServer } = await import('../src/app.js');

type C = Socket<ServerToClientEvents, ClientToServerEvents>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { httpServer, rooms } = createJinxoServer();
await new Promise<void>((r) => httpServer.listen(0, r));
const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

class Bot {
  socket: C;
  state: RoomView | null = null;
  /** ทุก payload ที่เคยได้รับ (ไว้ตรวจว่าไม่มีข้อมูลรั่ว) */
  received: string[] = [];
  session: SessionInfo | null = null;

  constructor(readonly name: string) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('room:state', (s) => {
      this.state = s;
      this.received.push(JSON.stringify(s));
    });
  }

  ready() {
    return new Promise<void>((r) => (this.socket.connected ? r() : this.socket.once('connect', () => r())));
  }

  call<T = null>(event: string, payload?: unknown): Promise<AckResult<T>> {
    return new Promise((resolve) => {
      const s = this.socket as unknown as { emit: (...a: unknown[]) => void };
      if (payload === undefined) s.emit(event, resolve);
      else s.emit(event, payload, resolve);
    });
  }

  async ok<T = null>(event: string, payload?: unknown): Promise<T> {
    const r = await this.call<T>(event, payload);
    if (!r.ok) throw new Error(`${this.name} ${event}: ${r.error.code} ${r.error.message}`);
    return r.data;
  }

  async fail(event: string, payload: unknown, code: string) {
    const r = await this.call(event, payload);
    assert.equal(r.ok, false, `${this.name} ${event} ควร error ${code}`);
    if (!r.ok) assert.equal(r.error.code, code, `${event}: ได้ ${r.error.code} (${r.error.message})`);
  }

  get s(): RoomView {
    assert.ok(this.state, `${this.name} ยังไม่มี state`);
    return this.state;
  }

  emptyCells(): number[] {
    return this.s.myBoard.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  }
}

async function until(desc: string, check: () => boolean, timeout = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timeout: ${desc}`);
    await sleep(20);
  }
}

const results: string[] = [];
async function scenario(name: string, fn: () => Promise<void>) {
  const t = Date.now();
  await fn();
  results.push(`✔ ${name} (${Date.now() - t}ms)`);
  console.log(`✔ ${name}`);
}

async function makeRoom(names: string[]) {
  const bots = names.map((n) => new Bot(n));
  await Promise.all(bots.map((b) => b.ready()));
  const host = bots[0];
  host.session = await host.ok<SessionInfo>('room:create', { name: host.name });
  for (const b of bots.slice(1)) {
    b.session = await b.ok<SessionInfo>('room:join', { roomCode: host.session.roomCode.toLowerCase(), name: b.name });
  }
  await until('lobby sync', () => bots.every((b) => b.state?.players.length === bots.length));
  return { bots, host, code: host.session.roomCode };
}

const close = (bots: Bot[]) => bots.forEach((b) => b.socket.disconnect());

// ─────────────────────────────────────────────────────────────

await scenario('เล่นครบ 1 เกม 5 คน (3 รอบ) + ข้อมูลไม่รั่ว + คะแนนตรงกันทุกจอ', async () => {
  const { bots, host } = await makeRoom(['Tew', 'Mint', 'Ploy', 'Bank', 'Fah']);
  await bots[1].fail('game:start', undefined, 'NOT_HOST');
  await host.ok('lobby:setCategories', { categories: ['food', 'animals', 'funny'] });
  await host.ok('game:start');
  await until('answering', () => bots.every((b) => b.state?.phase === 'answering'));

  for (let round = 0; round < 3; round++) {
    for (let t = 0; t < 3; t++) {
      await until(`topic ${t}`, () => bots.every((b) => b.s.currentTopicIndex === t && b.s.roundIndex === round));
      // ทุกคนเห็นหัวข้อเดียวกัน
      const q = bots[0].s.topics[t].question;
      assert.ok(bots.every((b) => b.s.topics[t].question === q));
      for (const [i, b] of bots.entries()) {
        // คำลับเฉพาะคนนี้ — ต้องไม่โผล่ในจอคนอื่นก่อน reveal
        const secret = `ลับ${b.name}${round}${t}`;
        const words =
          i < 2 ? [`ตรง${round}${t}`, `จิ๊ง${round}${t}`, secret] : i < 4 ? [`ตรง${round}${t}`, `คู่${round}${t}`, secret] : [`ตรง${round}${t}`, `${b.name}x${round}${t}`, secret];
        const cells = b.emptyCells();
        await b.ok('answer:submit', { placements: words.map((text, k) => ({ cellIndex: cells[k], text })) });
        if (i === 0) {
          await b.fail('answer:submit', { placements: words.map((text, k) => ({ cellIndex: cells[k + 3] ?? 0, text })) }, 'ALREADY_SUBMITTED');
          await until('ready count', () => bots[1].s.readyCount >= 1);
          assert.equal(bots[1].s.requiredCount, 5);
        }
      }
    }
    await until('reveal', () => bots.every((b) => b.s.phase === 'reveal'));
    // ก่อนเปิด: ห้ามมีคำลับของใครในข้อมูลที่ "คนอื่น" ได้รับเลย
    for (const viewer of bots) {
      const blob = viewer.received.join('\n');
      for (const other of bots) {
        if (other === viewer) continue;
        assert.ok(!blob.includes(`ลับ${other.name}${round}`), `${viewer.name} เห็นคำตอบของ ${other.name} ก่อน reveal`);
      }
    }
    await bots[2].fail('reveal:next', undefined, 'NOT_HOST');
    // เปิดทีละขั้นจนครบ
    const total = host.s.reveal!.totalSteps;
    for (let k = 0; k < total; k++) await host.ok('reveal:next');
    await until('review', () => bots.every((b) => b.s.phase === 'review'));
    // Host รวม "คู่" กับ "จิ๊ง" ของหัวข้อแรก → กลายเป็นตรงกัน 4 คน
    const g = host.s.reveal!.groups;
    const a = g.find((x) => x.label === `จิ๊ง${round}0`)!;
    const b = g.find((x) => x.label === `คู่${round}0`)!;
    assert.equal(a.kind, 'jinxo');
    await host.ok('review:merge', { topicIndex: 0, groupIds: [a.id, b.id] });
    await until('merge sync', () => bots[4].s.reveal!.groups.some((x) => x.id === a.id && x.playerCount === 4));
    await host.ok('round:finalize');
    await until('round result', () => bots.every((b) => b.s.phase === 'roundResult'));
    const json = JSON.stringify(bots[0].s.roundResult);
    assert.ok(bots.every((x) => JSON.stringify(x.s.roundResult) === json), 'ผลคะแนนไม่ตรงกันทุกจอ');
    const tew = bots[0].s.roundResult!.scores.find((s) => s.name === 'Tew')!;
    // ตรง×3 หัวข้อ: 5 คน = 1 แต้ม → 3, จิ๊ง: หัวข้อ0 รวมเป็น 4 คน = 1, หัวข้อ1-2 JinxO = 2+2 → base 8
    assert.equal(tew.basePoints, 8, `Tew base ${tew.basePoints}`);
    await host.ok('round:next');
  }
  await until('final', () => bots.every((b) => b.s.phase === 'finalResult'));
  const f = host.s.final!;
  assert.equal(f.standings.length, 5);
  assert.ok(f.standings[0].total >= f.standings[4].total);
  await host.ok('game:playAgain');
  await until('back to lobby', () => bots.every((b) => b.s.phase === 'lobby' && b.s.players.every((p) => p.totalScore === 0)));
  close(bots);
});

await scenario('validation ฝั่ง server: payload มั่ว, คำซ้ำ, ส่งเกิน, ช่องทับ', async () => {
  const { bots, host } = await makeRoom(['A', 'B', 'C']);
  await host.fail('room:join', { roomCode: 123 }, 'INVALID_PAYLOAD');
  await host.fail('answer:submit', { placements: [] }, 'WRONG_PHASE');
  await host.ok('game:start');
  await until('answering', () => host.state?.phase === 'answering');
  await host.fail('answer:submit', 'garbage', 'INVALID_PAYLOAD');
  await host.fail('answer:submit', { placements: [{ cellIndex: 0, text: 'x' }] }, 'INVALID_PAYLOAD');
  await host.fail(
    'answer:submit',
    { placements: [0, 1, 2, 3].map((i) => ({ cellIndex: i, text: `w${i}` })) },
    'INVALID_PAYLOAD',
  );
  await host.fail(
    'answer:submit',
    { placements: [{ cellIndex: 0, text: 'แมว' }, { cellIndex: 1, text: 'แมว ' }, { cellIndex: 2, text: 'x' }] },
    'DUPLICATE_ANSWER',
  );
  await host.fail(
    'answer:submit',
    { placements: [{ cellIndex: 0, text: 'a' }, { cellIndex: 0, text: 'b' }, { cellIndex: 2, text: 'c' }] },
    'CELL_TAKEN',
  );
  await host.fail(
    'answer:submit',
    { placements: [{ cellIndex: 12, text: 'a' }, { cellIndex: 1, text: 'b' }, { cellIndex: 2, text: 'c' }] },
    'INVALID_PAYLOAD',
  );
  // กด confirm รัว ๆ พร้อมกัน — ต้องรับแค่ครั้งเดียว
  const pl = { placements: [{ cellIndex: 0, text: 'a' }, { cellIndex: 1, text: 'b' }, { cellIndex: 2, text: 'c' }] };
  const burst = await Promise.all([host.call('answer:submit', pl), host.call('answer:submit', pl), host.call('answer:submit', pl)]);
  assert.equal(burst.filter((r) => r.ok).length, 1);
  // event ที่ไม่มีอยู่จริง (เช่นพยายามส่งคะแนนเอง) ถูกเพิกเฉย server ไม่ล่ม
  (host.socket as unknown as { emit: (...a: unknown[]) => void }).emit('score:set', { points: 999 });
  await sleep(50);
  assert.equal(host.s.players.find((p) => p.name === 'A')!.totalScore, 0);
  close(bots);
});

await scenario('ห้องเต็ม 7 คน, ชื่อซ้ำ, ไม่พบห้อง, เข้าระหว่างเกมไม่ได้', async () => {
  const { bots, code } = await makeRoom(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  const extra = new Bot('p8');
  await extra.ready();
  await extra.fail('room:join', { roomCode: code, name: 'p8' }, 'ROOM_FULL');
  await extra.fail('room:join', { roomCode: 'ZZZZZZ', name: 'p8' }, 'ROOM_NOT_FOUND');
  await bots[6].ok('room:leave');
  await extra.fail('room:join', { roomCode: code, name: 'P1' }, 'NAME_TAKEN');
  await extra.ok('room:join', { roomCode: code, name: 'p8' });
  await bots[0].ok('game:start');
  const late = new Bot('late');
  await late.ready();
  await late.fail('room:join', { roomCode: code, name: 'late' }, 'GAME_IN_PROGRESS');
  close([...bots, extra, late]);
});

await scenario('หลุดกลางเกมแล้ว reconnect ด้วย token: กระดานเดิมกลับมา', async () => {
  const { bots, host, code } = await makeRoom(['H', 'X', 'Y']);
  await host.ok('game:start');
  await until('answering', () => bots.every((b) => b.state?.phase === 'answering'));
  const y = bots[2];
  await y.ok('answer:submit', { placements: [{ cellIndex: 4, text: 'ok1' }, { cellIndex: 5, text: 'ok2' }, { cellIndex: 6, text: 'ok3' }] });
  const session = y.session!;
  y.socket.disconnect();
  await until('X sees Y offline', () => bots[1].s.players.find((p) => p.name === 'Y')!.connected === false);
  // token ผิดต้องเข้าไม่ได้
  const fake = new Bot('fake');
  await fake.ready();
  await fake.fail('room:rejoin', { ...session, token: 'nope' }, 'SESSION_INVALID');
  const y2 = new Bot('Y');
  await y2.ready();
  await y2.ok('room:rejoin', { ...session, roomCode: code });
  await until('Y state', () => y2.state !== null);
  assert.equal(y2.s.myBoard[4]?.text, 'ok1');
  assert.equal(y2.s.myReady, true);
  await until('Y online', () => bots[1].s.players.find((p) => p.name === 'Y')!.connected);
  // เปิดซ้อนแท็บด้วย session เดิม → แท็บเก่าถูกตัด
  const y3 = new Bot('Y');
  await y3.ready();
  await y3.ok('room:rejoin', session);
  await until('old tab kicked', () => !y2.socket.connected);
  close([...bots, fake, y2, y3]);
});

await scenario('คนหลุดนานเกินกำหนด → เกมเดินต่อไม่ค้าง', async () => {
  const { bots, host } = await makeRoom(['H', 'A', 'Gone']);
  await host.ok('game:start');
  await until('answering', () => bots.every((b) => b.state?.phase === 'answering'));
  bots[2].socket.disconnect();
  for (const b of bots.slice(0, 2)) {
    const c = b.emptyCells();
    await b.ok('answer:submit', { placements: ['q', 'w', 'e'].map((t, k) => ({ cellIndex: c[k], text: t + b.name })) });
  }
  assert.equal(host.s.currentTopicIndex, 0);
  await until('auto skip after grace', () => host.s.currentTopicIndex === 1, 4000);
  // หัวข้อถัดไปไม่ต้องรอคนที่หลุดอยู่
  assert.equal(host.s.requiredCount, 2);
  close(bots);
});

await scenario('Host ออก → โอน Host, Host หลุดนาน → โอน Host', async () => {
  const { bots, host } = await makeRoom(['H', 'N1', 'N2']);
  await host.ok('room:leave');
  await until('new host', () => bots[1].s.hostId === bots[1].s.you.id);
  assert.equal(bots[2].s.players.find((p) => p.isHost)!.name, 'N1');
  bots[1].socket.disconnect();
  await until('host transfer after grace', () => bots[2].s.you.isHost, 4000);
  close(bots);
});

await scenario('หลายห้องพร้อมกัน ข้อมูลไม่ปนกัน', async () => {
  const r1 = await makeRoom(['a1', 'a2', 'a3']);
  const r2 = await makeRoom(['b1', 'b2', 'b3']);
  assert.notEqual(r1.code, r2.code);
  await r1.host.ok('game:start');
  await until('r1 answering', () => r1.bots.every((b) => b.state?.phase === 'answering'));
  await sleep(100);
  assert.ok(r2.bots.every((b) => b.s.phase === 'lobby'));
  assert.ok(r2.bots.every((b) => b.received.every((j) => !j.includes('"a1"'))));
  // คนในห้อง 2 สั่งห้อง 1 ไม่ได้ (socket ผูกกับห้องตัวเองเท่านั้น)
  await r2.host.fail('reveal:next', undefined, 'WRONG_PHASE');
  close([...r1.bots, ...r2.bots]);
});

await scenario('rate limit กันสแปม', async () => {
  const { bots, host } = await makeRoom(['s1', 's2', 's3']);
  const res = await Promise.all(Array.from({ length: 120 }, () => host.call('lobby:setCategories', { categories: ['food'] })));
  assert.ok(res.some((r) => !r.ok && r.error.code === 'RATE_LIMITED'));
  close(bots);
});

console.log(`\nผ่านทั้งหมด ${results.length} สถานการณ์ — ห้องค้างใน server: ${rooms.size}`);
httpServer.close();
process.exit(0);
