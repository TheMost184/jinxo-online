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
  kicked: string | null = null;
  session: SessionInfo | null = null;

  constructor(readonly name: string) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('room:state', (s) => {
      this.state = s;
      this.received.push(JSON.stringify(s));
    });
    this.socket.on('room:kicked', (n) => (this.kicked = n.message));
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

  get id() {
    return this.s.you.id;
  }

  emptyCells(): number[] {
    return this.s.myBoard.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  }

  cellOf(text: string): number {
    return this.s.myBoard.findIndex((c) => c?.text === text);
  }
}

async function until(desc: string, check: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timeout: ${desc}`);
    await sleep(15);
  }
}

const results: string[] = [];
async function scenario(name: string, fn: () => Promise<void>) {
  const t = Date.now();
  await fn();
  results.push(name);
  console.log(`✔ ${name} (${Date.now() - t}ms)`);
}

async function makeRoom(names: string[]) {
  const bots = names.map((n) => new Bot(n));
  await Promise.all(bots.map((b) => b.ready()));
  const host = bots[0];
  host.session = await host.ok<SessionInfo>('room:create', { name: host.name });
  // ทุกคนเข้าห้องพร้อมกัน
  await Promise.all(
    bots.slice(1).map(async (b) => {
      b.session = await b.ok<SessionInfo>('room:join', { roomCode: host.session!.roomCode.toLowerCase(), name: b.name });
    }),
  );
  await until('lobby sync', () => bots.every((b) => b.state?.players.length === bots.length));
  return { bots, host, code: host.session.roomCode };
}

/** ทุกคนตอบครบ 3 หัวข้อของรอบนี้ — words(i, t) คืนคำ 3 คำของบอทคนที่ i หัวข้อ t */
async function answerRound(bots: Bot[], words: (i: number, t: number) => string[]) {
  for (let t = 0; t < 3; t++) {
    await until(`topic ${t}`, () => bots.every((b) => b.state?.phase === 'answering' && b.s.currentTopicIndex === t));
    await Promise.all(
      bots.map((b, i) => {
        const cells = b.emptyCells();
        return b.ok('answer:submit', { placements: words(i, t).map((text, k) => ({ cellIndex: cells[k], text })) });
      }),
    );
  }
  await until('reveal', () => bots.every((b) => b.state?.phase === 'reveal'));
}

/** Host เปิดจนจบรอบ (ไม่มีคำขอค้าง) */
async function revealRest(host: Bot, bots: Bot[]) {
  for (let guard = 0; guard < 400; guard++) {
    if (host.s.phase !== 'reveal') return;
    const r = await host.call('reveal:nextAnswer');
    if (!r.ok) {
      assert.equal(r.error.code, 'NOTHING_TO_REVEAL', r.error.message);
      await host.ok('reveal:nextPlayer');
    }
    // ความเร็วระดับคนกดรัว ๆ (~14 ครั้ง/วิ) ไม่ให้ชน rate limit 80 ครั้ง/5 วิ
    await sleep(70);
  }
  await until('round summary', () => bots.every((b) => b.state?.phase === 'roundResult'));
}

const close = (bots: Bot[]) => bots.forEach((b) => b.socket.disconnect());
const NAMES15 = ['Tew', 'Mint', 'Most', 'Beam', 'Ice', 'Pond', 'Fah', 'Bank', 'Ploy', 'Nut', 'Jay', 'Ken', 'Lin', 'Oat', 'Pim'];

// ─────────────────────────────────────────────────────────────

await scenario('[1,17] 15 คนเข้าห้องพร้อมกัน → เล่นครบ 3 รอบ เปิดทีละคน ข้อมูลไม่รั่ว คะแนนตรงกันทุกจอ', async () => {
  const { bots, host, code } = await makeRoom(NAMES15);
  const extra = new Bot('Extra');
  await extra.ready();
  await extra.fail('room:join', { roomCode: code, name: 'Extra' }, 'ROOM_FULL');
  extra.socket.disconnect();
  await host.ok('game:start');
  for (let round = 0; round < 3; round++) {
    await answerRound(bots, (i, t) => [`ฮิต${round}${t}`, i < 2 ? `คู่${round}${t}` : `ลับ${bots[i].name}${round}${t}`, `เดี่ยว${bots[i].name}${round}${t}`]);
    // ก่อนถึงตาเจ้าของ คำลับต้องไม่อยู่ในข้อมูลที่คนอื่นได้รับเลย
    const order = host.s.reveal!.order;
    assert.equal(order.length, 15);
    for (const viewer of bots) {
      const blob = viewer.received.join('\n');
      for (const other of bots) {
        if (other === viewer) continue;
        assert.ok(!blob.includes(`เดี่ยว${other.name}${round}`), `${viewer.name} เห็นคำของ ${other.name} ก่อนเปิด`);
      }
    }
    await revealRest(host, bots);
    const json = JSON.stringify(bots[0].s.roundResult!.scores);
    assert.ok(bots.every((x) => JSON.stringify(x.s.roundResult!.scores) === json), 'ผลคะแนนไม่ตรงกันทุกจอ');
    const r = host.s.roundResult!;
    // ฮิต = 15 คน → 1 แต้ม × 3 หัวข้อ, คู่ = JinxO 2 คน (Tew, Mint) → 2 × 3
    const tew = r.scores.find((s) => s.name === 'Tew')!;
    const pim = r.scores.find((s) => s.name === 'Pim')!;
    assert.equal(tew.basePoints, 9);
    assert.equal(pim.basePoints, 3);
    assert.equal(r.topMatched[0].size, 15);
    assert.equal(r.boards.length, 15);
    await host.ok('round:next');
  }
  await until('final', () => bots.every((b) => b.state?.phase === 'finalResult'));
  assert.equal(host.s.final!.standings.length, 15);
  // ขนาด state ต่อคนตอน Round Summary 15 คน (ก่อนบีบอัด)
  const size = Math.max(...bots[0].received.map((j) => j.length));
  console.log(`   state ใหญ่สุด ${Math.round(size / 1024)} KB (ส่งแบบบีบอัด perMessageDeflate)`);
  close(bots);
});

await scenario('[2,3] Host เตะผู้เล่นใน Lobby, token เก่าเข้าไม่ได้, join ใหม่ได้', async () => {
  const { bots, host, code } = await makeRoom(['H', 'A', 'Victim', 'B']);
  const victim = bots[2];
  const oldSession = victim.session!;
  await bots[1].fail('lobby:kick', { playerId: victim.id }, 'NOT_HOST');
  await host.fail('lobby:kick', { playerId: host.id }, 'INVALID_PAYLOAD');
  await host.ok('lobby:kick', { playerId: victim.id });
  await until('kicked notice', () => victim.kicked === 'คุณถูกนำออกจากห้องโดย Host');
  await until('list updated', () => bots[1].s.players.length === 3);
  // socket เดิมสั่งอะไรในห้องไม่ได้แล้ว
  await victim.fail('lobby:setCategories', { categories: ['food'] }, 'NOT_IN_ROOM');
  const again = new Bot('Victim');
  await again.ready();
  await again.fail('room:rejoin', oldSession, 'KICKED');
  await again.ok('room:join', { roomCode: code, name: 'Victim' });
  await until('rejoined', () => bots[1].s.players.length === 4);
  await host.ok('game:start');
  await host.fail('lobby:kick', { playerId: bots[1].id }, 'WRONG_PHASE');
  close([...bots, again]);
});

await scenario('[7-11] Match Request: ซ้ำ, เกิน 1 คำ, พร้อมกันหลายคน, Host อนุมัติซ้ำ, กลุ่ม 2→3 คนคิดคะแนนใหม่', async () => {
  const { bots, host } = await makeRoom(['H', 'Mint', 'Most', 'Beam']);
  await host.ok('game:start');
  // หัวข้อ 0: Mint=กรุงเทพ, Most=กทม., Beam=กรุงเทพมหานคร, H=ตรุง ; Mint,H มี "คู่" ตรงกัน
  await answerRound(bots, (i, t) => {
    if (t > 0) return [`${i}-${t}-a`, `${i}-${t}-b`, `${i}-${t}-c`];
    return [['ตรุง', 'คู่', 'h1'], ['กรุงเทพ', 'คู่', 'm1'], ['กทม.', 'o1', 'o2'], ['กรุงเทพมหานคร', 'b1', 'b2']][i];
  });
  const [, mint, most, beam] = bots;
  // ไปให้ถึงตา Mint
  while (host.s.reveal!.currentPlayerId !== mint.id) {
    const r = await host.call('reveal:nextAnswer');
    if (!r.ok) await host.ok('reveal:nextPlayer');
    await sleep(5);
  }
  // เปิดจนเจอ "กรุงเทพ"
  await until('focus', () => true);
  for (;;) {
    await host.ok('reveal:nextAnswer');
    await sleep(10);
    const f = host.s.reveal!.focusAnswerId;
    const shown = host.s.reveal!.boards.flatMap((b) => b.cells).find((c) => c.state === 'shown' && c.answer.id === f);
    if (shown && shown.state === 'shown' && shown.answer.text === 'กรุงเทพ') break;
  }
  const target = host.s.reveal!.focusAnswerId!;
  // หลายคนส่งพร้อมกัน + ส่งซ้ำ + ส่งคำที่ 2 สำหรับคำเดียวกัน
  const results = await Promise.all([
    most.call('match:request', { targetAnswerId: target, cellIndex: most.cellOf('กทม.') }),
    beam.call('match:request', { targetAnswerId: target, cellIndex: beam.cellOf('กรุงเทพมหานคร') }),
    most.call('match:request', { targetAnswerId: target, cellIndex: most.cellOf('กทม.') }),
    most.call('match:request', { targetAnswerId: target, cellIndex: most.cellOf('o1') }),
  ]);
  assert.deepEqual(results.map((r) => (r.ok ? 'ok' : r.error.code)), ['ok', 'ok', 'DUPLICATE_REQUEST', 'DUPLICATE_REQUEST']);
  await mint.fail('match:request', { targetAnswerId: target, cellIndex: 2 }, 'OWN_ANSWER');
  await until('queue visible to all', () => bots.every((b) => b.s.reveal!.requests.filter((r) => r.status === 'pending').length === 2));
  await host.fail('reveal:nextAnswer', undefined, 'PENDING_REQUESTS');
  await most.fail('match:decide', { requestId: 'm1', approve: true }, 'NOT_HOST');
  const [r1, r2] = host.s.reveal!.requests;
  // Host อนุมัติซ้ำพร้อมกัน → นับครั้งเดียว
  const dup = await Promise.all([
    host.call('match:decide', { requestId: r1.id, approve: true }),
    host.call('match:decide', { requestId: r1.id, approve: true }),
  ]);
  assert.deepEqual(dup.map((r) => (r.ok ? 'ok' : r.error.code)), ['ok', 'ALREADY_DECIDED']);
  const pts = (b: Bot, owner: string, text: string) => {
    const board = b.s.reveal!.boards.find((x) => x.playerId === owner)!;
    const c = board.cells.find((x) => x.state === 'shown' && x.answer.text === text);
    return c && c.state === 'shown' ? c.answer.points : null;
  };
  await until('2 คน', () => pts(beam, mint.id, 'กรุงเทพ') === 2);
  assert.equal(pts(beam, most.id, 'กทม.'), 2);
  await host.ok('match:decide', { requestId: r2.id, approve: true });
  await until('3 คน', () => pts(beam, mint.id, 'กรุงเทพ') === 1);
  assert.equal(pts(mint, most.id, 'กทม.'), 1);
  assert.equal(pts(most, beam.id, 'กรุงเทพมหานคร'), 1);
  await revealRest(host, bots);
  const top = host.s.roundResult!.topMatched[0];
  assert.equal(top.size, 3);
  assert.deepEqual(new Set(top.variants), new Set(['กรุงเทพ', 'กทม.', 'กรุงเทพมหานคร']));
  close(bots);
});

await scenario('[5,6,12-14,20] Like/Unlike, Like ตัวเอง/คำที่ยังไม่เปิด, Refresh ระหว่าง Reveal, Host refresh ระหว่างตัดสิน', async () => {
  const { bots, host } = await makeRoom(['H', 'A', 'B']);
  await host.ok('game:start');
  await answerRound(bots, (i, t) => [`w${i}${t}a`, `w${i}${t}b`, i === 0 ? `share${t}` : i === 1 ? `share${t}` : `solo${t}`]);
  await host.ok('reveal:nextAnswer');
  await sleep(20);
  const focus = host.s.reveal!.focusAnswerId!;
  const owner = bots.find((b) => b.id === focus.split(':')[0])!;
  const fans = bots.filter((b) => b !== owner);
  await owner.fail('answer:like', { answerId: focus, like: true }, 'OWN_ANSWER');
  // ช่องที่ยังไม่เปิด
  const hiddenId = `${owner.id}:${[0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => `${owner.id}:${i}` !== focus && owner.s.myBoard[i])}`;
  await fans[0].fail('answer:like', { answerId: hiddenId, like: true }, 'NOT_REVEALED');
  await Promise.all(fans.map((f) => f.ok('answer:like', { answerId: focus, like: true })));
  await fans[0].ok('answer:like', { answerId: focus, like: true }); // กดซ้ำไม่นับเพิ่ม
  const likes = () => {
    const c = host.s.reveal!.boards.flatMap((b) => b.cells).find((x) => x.state === 'shown' && x.answer.id === focus);
    return c && c.state === 'shown' ? c.answer.likes : -1;
  };
  await until('2 likes', () => likes() === 2);
  await fans[1].ok('answer:like', { answerId: focus, like: false });
  await until('1 like', () => likes() === 1);

  // [5] ผู้เล่นรีเฟรชระหว่าง Reveal → Like ที่กดไว้ยังอยู่
  const s = fans[0].session!;
  fans[0].socket.disconnect();
  const back = new Bot(fans[0].name);
  await back.ready();
  await back.ok('room:rejoin', s);
  await until('state back', () => back.state?.phase === 'reveal');
  assert.deepEqual(back.s.myLikes, [focus]);

  // [6] มีคำขอค้าง แล้ว Host รีเฟรช → คำขอยังอยู่ ตัดสินต่อได้
  // คำแรกที่เปิดคือช่อง 0 (หัวข้อ 0) ของคนแรก — fans[1] เสนอช่อง 0 ของตัวเอง (หัวข้อเดียวกัน)
  const live = fans[1];
  assert.equal(live.s.myBoard[0]?.topicIndex, 0);
  await live.ok('match:request', { targetAnswerId: focus, cellIndex: 0 });
  const hs = host.session!;
  host.socket.disconnect();
  const host2 = new Bot('H');
  await host2.ready();
  await host2.ok('room:rejoin', hs);
  await until('host state', () => host2.state?.phase === 'reveal');
  const pending = host2.s.reveal!.requests.filter((r) => r.status === 'pending');
  assert.equal(pending.length, 1);
  assert.equal(host2.s.you.isHost, true);
  await host2.ok('match:decide', { requestId: pending[0].id, approve: false });
  await until('rejected for all', () => live.s.reveal!.requests.some((r) => r.status === 'rejected'));
  await revealRest(host2, [host2, ...bots.slice(1).map((b) => (b === fans[0] ? back : b))]);
  const res = host2.s.roundResult!;
  assert.equal(res.topLiked[0].answerId, focus);
  assert.equal(res.topLiked[0].likes, 1);
  // Like ไม่มีผลกับคะแนน: คนที่มี share ได้ JinxO 2×3 = 6 แต้ม ไม่ว่าจะได้ like เท่าไร
  assert.equal(res.scores.find((x) => x.playerId === bots[0].id)!.basePoints, 6);
  close([...bots, back, host2]);
});

await scenario('[15] คำที่ตรงกันแล้วถูกเปิดค้างไว้ตอนถึงตาเจ้าของ Host ไม่ต้องเปิดซ้ำ', async () => {
  const { bots, host } = await makeRoom(['H', 'A', 'B']);
  await host.ok('game:start');
  await answerRound(bots, (i, t) => [`same${t}`, `u${i}${t}a`, `u${i}${t}b`]);
  const order = host.s.reveal!.order;
  // คนแรก: เปิด 3 ช่อง (same เปิดของทุกคนไปด้วย)
  for (let k = 0; k < 9; k++) await host.ok('reveal:nextAnswer');
  await host.fail('reveal:nextAnswer', undefined, 'NOTHING_TO_REVEAL');
  await host.ok('reveal:nextPlayer');
  await until('second player', () => host.s.reveal!.currentPlayerId === order[1]);
  const second = host.s.reveal!.boards.find((b) => b.playerId === order[1])!;
  const preShown = second.cells.filter((c) => c.state === 'shown');
  assert.equal(preShown.length, 3);
  assert.ok(preShown.every((c) => c.state === 'shown' && c.answer.revealedBy === 'match' && c.answer.points === 1));
  // คนที่สองต้องกดเปิดแค่ 6 ช่อง
  for (let k = 0; k < 6; k++) await host.ok('reveal:nextAnswer');
  await host.fail('reveal:nextAnswer', undefined, 'NOTHING_TO_REVEAL');
  close(bots);
});

await scenario('[4] คิดโจทย์เอง: คนตั้งโจทย์หลุด → สุ่มใหม่ ไม่ค้างที่หน้ารอ', async () => {
  const { bots, host } = await makeRoom(['H', 'A', 'B', 'C']);
  await host.ok('lobby:setCategories', { categories: ['custom'] });
  await host.fail('lobby:setCategories', { categories: ['custom', 'food'] }, 'INVALID_PAYLOAD');
  await host.ok('game:start');
  await until('authoring', () => bots.every((b) => b.state?.phase === 'authoring'));
  const authorId = host.s.authoring!.authorId;
  const author = bots.find((b) => b.id === authorId)!;
  const others = bots.filter((b) => b !== author);
  await others[0].fail('question:submit', { question: 'แอบตั้ง' }, 'NOT_AUTHOR');
  author.socket.disconnect();
  await until('reassigned', () => others[0].s.authoring !== null && others[0].s.authoring.authorId !== authorId, 6000);
  const newAuthor = others.find((b) => b.id === others[0].s.authoring!.authorId)!;
  await newAuthor.ok('question:submit', { question: 'ของที่ต้องมีติดบ้าน' });
  await until('topic shown', () => others.every((b) => b.state?.phase === 'answering' && b.s.topics[0]?.question === 'ของที่ต้องมีติดบ้าน'));
  assert.equal(others[0].s.topics[0].authorId, newAuthor.id);
  close(bots);
});

await scenario('validation ฝั่ง server: payload มั่ว, event ปลอม, คำซ้ำ, กด confirm รัว ๆ', async () => {
  const { bots, host } = await makeRoom(['A', 'B', 'C']);
  await host.fail('room:join', { roomCode: 123 }, 'INVALID_PAYLOAD');
  await host.fail('answer:submit', { placements: [] }, 'WRONG_PHASE');
  await host.ok('game:start');
  await until('answering', () => host.state?.phase === 'answering');
  await host.fail('answer:submit', 'garbage', 'INVALID_PAYLOAD');
  await host.fail('match:request', { targetAnswerId: 'x:0', cellIndex: 0 }, 'WRONG_PHASE');
  await host.fail('answer:like', { answerId: 'x:0', like: true }, 'WRONG_PHASE');
  await host.fail(
    'answer:submit',
    { placements: [{ cellIndex: 0, text: 'แมว' }, { cellIndex: 1, text: 'แมว ' }, { cellIndex: 2, text: 'x' }] },
    'DUPLICATE_ANSWER',
  );
  const pl = { placements: [{ cellIndex: 0, text: 'a' }, { cellIndex: 1, text: 'b' }, { cellIndex: 2, text: 'c' }] };
  const burst = await Promise.all([host.call('answer:submit', pl), host.call('answer:submit', pl), host.call('answer:submit', pl)]);
  assert.equal(burst.filter((r) => r.ok).length, 1);
  (host.socket as unknown as { emit: (...a: unknown[]) => void }).emit('score:set', { points: 999 });
  await sleep(50);
  assert.equal(host.s.players.find((p) => p.name === 'A')!.totalScore, 0);
  close(bots);
});

await scenario('หลุดนานเกินกำหนด → เกมเดินต่อ, Host หลุด → โอน Host, หลายห้องไม่ปนกัน', async () => {
  const r1 = await makeRoom(['H', 'A', 'Gone']);
  const r2 = await makeRoom(['x1', 'x2', 'x3']);
  await r1.host.ok('game:start');
  await until('answering', () => r1.bots.every((b) => b.state?.phase === 'answering'));
  r1.bots[2].socket.disconnect();
  for (const b of r1.bots.slice(0, 2)) {
    const c = b.emptyCells();
    await b.ok('answer:submit', { placements: ['q', 'w', 'e'].map((t, k) => ({ cellIndex: c[k], text: t + b.name })) });
  }
  await until('auto skip', () => r1.host.s.currentTopicIndex === 1, 5000);
  r1.host.socket.disconnect();
  await until('host transfer', () => r1.bots[1].s.you.isHost, 5000);
  assert.ok(r2.bots.every((b) => b.s.phase === 'lobby'));
  assert.ok(r2.bots.every((b) => b.received.every((j) => !j.includes('"Gone"'))));
  close([...r1.bots, ...r2.bots]);
});

console.log(`\nผ่านทั้งหมด ${results.length} สถานการณ์ — ห้องค้างใน server: ${rooms.size}`);
httpServer.close();
process.exit(0);
