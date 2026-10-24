# JinxO Online

บอร์ดเกมปาร์ตี้สำหรับเล่นกับเพื่อนออนไลน์ คุยกันใน Discord Voice แล้วเล่นบนเว็บ
ทุกคนได้หัวข้อเดียวกัน พิมพ์คำตอบลงกระดาน 3×3 แล้วเปิดพร้อมกัน — คำที่ตรงกับเพื่อนพอดี 2 คนคือ **JinxO** ได้แต้มเยอะที่สุด

- Multiplayer แบบ real-time ผ่าน Socket.IO, 3–7 คนต่อห้อง, หลายห้องพร้อมกันได้
- ไม่ต้องสมัครสมาชิก: สร้างห้อง → ส่งรหัส 6 ตัวหรือลิงก์เชิญใน Discord
- Server เป็นเจ้าของ state ทั้งหมด คำนวณคะแนนเอง และไม่ส่งคำตอบของคนอื่นไปที่ browser จนกว่าจะถึงช่วงเปิดคำตอบ
- รีเฟรช/หลุดแล้วกลับเข้าที่เดิมได้ทันที
- กติกาคะแนนและโบนัสแก้ได้จากไฟล์ config, คำถามเพิ่มได้จาก JSON (มีให้ 116 ข้อ 7 หมวด)

---

## เริ่มใช้งาน

ต้องมี **Node.js 20 ขึ้นไป**

```bash
npm install
npm run dev
```

เปิด <http://localhost:5173> — Vite รันหน้าเว็บ (5173) และส่งต่อ Socket.IO ไปที่ server (3001) ให้อัตโนมัติ

**ทดสอบหลายผู้เล่นบนเครื่องเดียว:** เปิดหลายแท็บได้เลย แต่ละแท็บคือผู้เล่นคนละคน (session เก็บใน `sessionStorage` แยกต่อแท็บ) แท็บแรกกดสร้างห้อง แท็บอื่นวางลิงก์เชิญ

**เล่นกับเพื่อนในวง LAN เดียวกัน:** ให้เพื่อนเปิด `http://<IP เครื่องคุณ>:5173`

### คำสั่งทั้งหมด

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รัน server + หน้าเว็บแบบ hot reload |
| `npm run build` | build หน้าเว็บไปที่ `client/dist` และ typecheck server |
| `npm start` | รันแบบ production (server เสิร์ฟหน้าเว็บจาก `client/dist` เอง พอร์ตเดียว) |
| `npm test` | unit test ของ scoring engine และ game state machine |
| `npm run test:sim` | จำลองผู้เล่นจริงหลายคนผ่าน Socket.IO เล่นครบเกม + edge cases |
| `npm run typecheck` | ตรวจ TypeScript ทั้ง 3 แพ็กเกจ |

---

## วิธีเล่น (ฉบับย่อที่โชว์ในเกมด้วย)

1. Host เลือกหมวดคำถามแล้วกดเริ่ม (ต้องมีอย่างน้อย 3 คน)
2. เกมมี 3 รอบ รอบละ 3 หัวข้อ แต่ละหัวข้อพิมพ์ 3 คำ แตะช่องว่างช่องไหนก็ได้บนกระดาน ครบ 3 หัวข้อกระดานเต็ม 9 ช่อง
3. กดยืนยันแล้วแก้ไม่ได้ ห้ามคำซ้ำในกระดานตัวเอง ทุกคนยืนยันครบจึงไปหัวข้อถัดไป
4. ช่วงเปิดคำตอบ Host กดเปิดทีละขั้น — คำที่ตรงกันเปิดทีละกลุ่ม (JinxO มีแอนิเมชัน) แล้วปิดท้ายหัวข้อด้วยคำที่ไม่ซ้ำใคร
5. เปิดครบแล้ว Host รวมคำที่สะกดต่างแต่หมายถึงสิ่งเดียวกันได้ (เช่น หมู = สุกร, Apple = แอปเปิ้ล) แล้วกดสรุปคะแนน
6. ดู Leaderboard ทุกรอบ จบ 3 รอบประกาศผู้ชนะ กด "เล่นอีกรอบ" ใช้ห้องเดิมได้

### กติกาคะแนนเริ่มต้น

| คำตอบนี้มีกี่คนตอบ | คะแนนต่อช่อง |
| --- | --- |
| ไม่ตรงกับใคร | 0 |
| ตรงกันพอดี 2 คน (JinxO) | 2 |
| ตรงกัน 3 คนขึ้นไป | 1 |

**โบนัสแนว:** ถ้าทั้ง 3 ช่องในแถวหรือคอลัมน์ตรงกับเพื่อนทั้งหมด ได้แต้มตาม "หมุด" ข้างกระดาน (ค่าเริ่มต้น แถว +1/+2/+3, คอลัมน์ +3/+2/+1) — การเลือกช่องวางคำตอบจึงเป็นกลยุทธ์ด้วย

**การเทียบคำตอบ:** ไม่สนตัวพิมพ์ใหญ่/เล็ก, ตัดช่องว่างเกิน, ตัดเว้นวรรคระหว่างตัวอักษรไทย ("ไก่ ทอด" = "ไก่ทอด"), ตัดเครื่องหมายวรรคตอนหัวท้าย และ Unicode NFC — แต่ **ไม่เดา** คำที่สะกดต่างกัน ("แอปเปิ้ล" ≠ "แอปเปิล") ให้ Host ตัดสินเอง

---

## ปรับกติกา

### `server/config/scoring.json`

```jsonc
{
  "tiers": [
    { "minPlayers": 1, "maxPlayers": 1, "points": 0, "kind": "none" },
    { "minPlayers": 2, "maxPlayers": 2, "points": 2, "kind": "jinxo" },
    { "minPlayers": 3, "points": 1, "kind": "match" }        // ไม่ใส่ maxPlayers = ไม่จำกัด
  ],
  "lineBonus": {
    "enabled": true,
    "condition": "matched",   // "matched" = ทุกช่องตรงกับใครก็ได้, "jinxo" = ทุกช่องต้องเป็น JinxO
    "rows": [1, 2, 3],        // โบนัสแถวบน/กลาง/ล่าง
    "columns": [3, 2, 1],     // โบนัสคอลัมน์ซ้าย/กลาง/ขวา
    "diagonals": [0, 0]       // แนวทแยง ↘ ↙ (0 = ปิด)
  }
}
```

`tiers` อ่านจากบนลงล่าง ใช้ชั้นแรกที่จำนวนคนเข้าเงื่อนไข เพิ่มชั้นได้ เช่นให้ตรงกัน 3 คนได้ 1.5 แต้มและ 4 คนขึ้นไปได้ 1 แต้ม

### `server/config/game.json`

| ค่า | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `minPlayers` / `maxPlayers` | 3 / 7 | จำนวนผู้เล่นต่อห้อง |
| `rounds` | 3 | จำนวนรอบ |
| `topicsPerRound` × `answersPerTopic` | 3 × 3 | ต้องคูณกันได้ 9 (ช่องบนกระดาน) |
| `maxAnswerLength` / `maxNameLength` | 40 / 16 | ความยาวสูงสุด |
| `disconnectGraceMs` | 20000 | หลุดนานเกินนี้ เกมไม่รอคนนั้นในหัวข้อปัจจุบัน |
| `hostTransferGraceMs` | 15000 | Host หลุดนานเกินนี้ โอน Host ให้คนที่เข้าห้องก่อนสุด |
| `lobbyDisconnectRemoveMs` | 60000 | หลุดในห้องรอนานเกินนี้ ถูกนำออกจากห้อง |
| `emptyRoomTtlMs` | 600000 | ไม่มีใครออนไลน์ในห้องนานเกินนี้ ลบห้องทิ้ง |

ทั้งสองไฟล์ถูก validate ตอนเปิด server ถ้าใส่ค่าผิด server จะบอกว่าผิดตรงไหนแล้วไม่ยอมเปิด แก้แล้วรีสตาร์ท server (ห้องที่เล่นค้างอยู่จะหายเพราะเก็บใน memory)

### เพิ่มคำถาม

แก้ `server/data/questions.json` — `id` ห้ามซ้ำ, `category` ต้องตรงกับหมวดใน `server/data/categories.json` (ถ้าเป็นหมวดใหม่ให้เพิ่มที่นั่นพร้อม `label` และ `emoji`)

```json
{ "id": 117, "category": "food", "question": "ของกินที่ต้องมีในงานวันเกิด", "language": "th" }
```

หัวข้อที่เล่นสนุกคือหัวข้อที่ "มีคำตอบยอดฮิตอยู่ไม่กี่คำ แต่ก็มีทางเลือกเยอะพอให้ไม่ตรงกันทั้งห้อง" เช่น "ผลไม้สีแดง" ดีกว่า "อาหาร" (กว้างไป) หรือ "สีของกล้วยสุก" (แคบไป)

ในเกมเดียวกันคำถามไม่ซ้ำกัน และห้องเดิมจะเลี่ยงคำถามที่เคยเล่นไปแล้วจนกว่าคำถามในหมวดที่เลือกจะหมด

---

## Deploy

Production รันเป็น **process เดียว**: Express เสิร์ฟหน้าเว็บที่ build แล้ว + Socket.IO บนพอร์ตเดียวกัน ไม่มีปัญหา CORS
เก็บ state ใน memory ของ process จึงต้องรัน **1 instance** (ห้ามเปิด autoscale หลายตัว ไม่งั้นผู้เล่นห้องเดียวกันจะไปคนละเครื่อง)

### Render / Railway (ง่ายสุด, มี free tier)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment: ไม่ต้องตั้งอะไร (`PORT` แพลตฟอร์มใส่ให้เอง)
- Instance: 1 ตัว ต้องรองรับ WebSocket (ทั้งสองเจ้ารองรับ)

> free tier บางเจ้าจะหลับเมื่อไม่มีคนใช้ ครั้งแรกที่เปิดอาจรอ ~30 วิ ระหว่างเล่นไม่มีผล

### Docker / VPS

```bash
docker build -t jinxo-online .
docker run -d -p 3001:3001 --restart unless-stopped jinxo-online
```

ถ้าอยู่หลัง Nginx ต้องเปิด WebSocket upgrade:

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

### แยกหน้าเว็บกับ server คนละโดเมน (ไม่จำเป็น)

ตั้ง `CORS_ORIGIN=https://your-frontend.example` ที่ server และให้หน้าเว็บต่อ socket ไปโดเมน server (แก้ `io()` ใน `client/src/services/socket.ts` เป็น `io('https://your-server.example')`)

### Environment variables

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `PORT` | 3001 | พอร์ตของ server |
| `CORS_ORIGIN` | (ไม่ตั้ง) | อนุญาต origin อื่น คั่นด้วย `,` |
| `JINXO_GAME_CONFIG` / `JINXO_SCORING_CONFIG` | `config/*.json` | ใช้ไฟล์ config อื่น (path นับจากโฟลเดอร์ `server/`) |
| `JINXO_QUESTIONS` | `data/questions.json` | ใช้คลังคำถามอื่น |
| `CLIENT_DIST` | `../client/dist` | ตำแหน่งหน้าเว็บที่ build แล้ว |
| `JINXO_SERVER` (ตอน dev) | `http://localhost:3001` | Vite ส่งต่อ socket ไปที่ไหน |

---

## Architecture

```text
jinxo-online/
├── shared/src/                # แพ็กเกจที่ client และ server ใช้ร่วมกัน
│   ├── types.ts               # Data models + RoomView (state ที่ client เห็น)
│   ├── events.ts              # สัญญา Socket.IO ทั้งสองทิศ + ErrorCode
│   ├── normalize.ts           # กฎการเทียบคำตอบ (ใช้ทั้งเช็กคำซ้ำฝั่ง client และนับคะแนนฝั่ง server)
│   └── board.ts               # แนวแถว/คอลัมน์/ทแยงของกระดาน
├── server/
│   ├── config/                # game.json, scoring.json
│   ├── data/                  # questions.json, categories.json
│   ├── src/
│   │   ├── app.ts / index.ts  # Express + Socket.IO, เสิร์ฟ client/dist ตอน production
│   │   ├── config.ts          # โหลด + validate config ด้วย zod
│   │   ├── game/scoring.ts    # ★ scoring engine (pure functions ไม่ผูก UI/socket)
│   │   ├── game/reveal.ts     # ลำดับการเปิดคำตอบ
│   │   ├── rooms/Room.ts      # ★ game state machine ของ 1 ห้อง (ตรวจสิทธิ์/phase/ข้อมูลทุก action)
│   │   ├── rooms/RoomManager.ts # สร้างรหัสห้อง, นาฬิกากติกาที่ขึ้นกับเวลา, ล้างห้องร้าง
│   │   ├── socket/            # schemas (zod) + registerHandlers (rate limit, ack, broadcast)
│   │   └── questions/         # คลังคำถาม + สุ่มไม่ซ้ำ
│   └── test/                  # unit tests + simulate.ts (bot หลาย client)
└── client/src/
    ├── App.tsx                # เลือกหน้าตาม phase ที่ server ส่งมา
    ├── pages/                 # Home, Lobby, Game, Reveal (+Review), Leaderboard, FinalResult
    ├── components/            # BoardFrame, PlayerList, JinxOBurst, Confetti, ...
    ├── hooks/useGame.tsx      # context: state ห้อง, การเชื่อมต่อ, reconnect, actions
    ├── services/              # socket (typed request/ack), session (sessionStorage)
    └── types/
```

### Game flow (state machine ฝั่ง server)

```text
lobby ──start──▶ answering ─(หัวข้อ 1→2→3 ทุกคนยืนยัน)─▶ reveal ─(เปิดครบ)─▶ review
  ▲                  ▲                                                        │ finalize
  │                  └──────────────── next round (รอบ 1, 2) ◀── roundResult ◀┘
  │                                                                │ next (รอบสุดท้าย)
  └──────────────────────── play again ◀── finalResult ◀───────────┘
```

### Socket events

ทุก event จาก client มี ack ตอบกลับเป็น `{ ok: true, data } | { ok: false, error: { code, message } }` (message เป็นภาษาไทยพร้อมแสดง)

| Client → Server | ใครส่งได้ | Phase |
| --- | --- | --- |
| `room:create {name}` / `room:join {roomCode, name}` | ทุกคน | — / lobby |
| `room:rejoin {roomCode, playerId, token}` | เจ้าของ token | ทุก phase |
| `room:leave` | ผู้เล่นในห้อง | ทุก phase |
| `lobby:setCategories {categories}` / `game:start` | Host | lobby |
| `answer:submit {placements: [{cellIndex, text}] ×3}` | ผู้เล่น | answering |
| `host:skipWaiting` | Host | answering |
| `reveal:next` / `reveal:all` | Host | reveal |
| `review:merge {topicIndex, groupIds}` / `review:split {groupId}` / `round:finalize` | Host | review |
| `round:next` | Host | roundResult |
| `game:playAgain` | Host | finalResult |

| Server → Client | |
| --- | --- |
| `room:state` | `RoomView` ทั้งห้องในมุมมองของผู้รับ ส่งทุกครั้งที่มีอะไรเปลี่ยน |
| `room:notice` | ข้อความแจ้งเตือน เช่น ใครหลุด/กลับมา/Host เปลี่ยน |

### ความปลอดภัยของเกม

- **ไม่มีคำตอบรั่ว:** ระหว่างตอบ server ส่งให้แต่ละคนแค่กระดานของตัวเอง + สถานะ "ตอบแล้ว" ของคนอื่น ช่วงเปิดคำตอบส่งเฉพาะคำที่ถูกเปิดแล้ว (ดูใน DevTools ก็ไม่เห็น) — `test:sim` ตรวจข้อนี้
- **คะแนนปลอมไม่ได้:** client ไม่มี event ที่ส่งคะแนน server คำนวณจากกระดานเองทั้งหมด
- **Validate 2 ชั้น:** zod ตรวจรูปร่าง payload → `Room` ตรวจกติกา (phase, สิทธิ์ Host, ช่องว่างจริง, จำนวนพอดี, คำซ้ำ, ความยาว)
- กด Confirm รัว ๆ รับแค่ครั้งแรก, ห้องเต็มเข้าไม่ได้, เข้ากลางเกมไม่ได้, ชื่อซ้ำในห้องไม่ได้, rate limit 80 event / 5 วิ ต่อการเชื่อมต่อ
- reconnect ต้องใช้ token ลับของผู้เล่นคนนั้น; เปิดซ้อนแท็บด้วย session เดิม แท็บเก่าจะถูกตัด

### การหลุดการเชื่อมต่อ

| สถานการณ์ | ผล |
| --- | --- |
| รีเฟรช / เน็ตหลุดสั้น ๆ | กลับเข้าที่เดิมอัตโนมัติ กระดาน คะแนน สถานะยืนยันครบ |
| หลุดระหว่างตอบ เกิน `disconnectGraceMs` | เพื่อนไม่ต้องรอ ช่องของหัวข้อนั้นว่าง (0 แต้ม) กลับมาทันก่อนหัวข้อจบก็ยังตอบได้ |
| คน AFK ไม่ตอบ | Host กด "ไม่รอคนที่ยังไม่ตอบ" |
| Host กดออก / หลุดเกิน `hostTransferGraceMs` | โอน Host ให้คนที่ออนไลน์และเข้าห้องก่อนสุด |
| กดออกจากห้องระหว่างเกม | ไม่ถูกรอ คะแนนยังโชว์ใน Leaderboard เข้ากลับเกมนั้นไม่ได้ |
| ทุกคนหลุดหมด | เกมหยุดรอ ไม่เดินทิ้ง ห้องถูกลบเมื่อร้างเกิน `emptyRoomTtlMs` |

### ต่อยอด

- เก็บ state ใน Redis แทน memory → รันหลาย instance ได้ (ใช้ `@socket.io/redis-adapter`) และ server รีสตาร์ทแล้วห้องไม่หาย
- ทำเป็น Discord Activity (Embedded App SDK) ให้เล่นในช่อง Voice ได้เลยไม่ต้องเปิดเว็บ
- จับเวลาต่อหัวข้อ, เสียงประกอบ, ให้ผู้เล่นโหวตรวมคำพ้องแทน Host
