import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { SERVER_ROOT, gameConfig, scoringConfig } from './config.js';
import { QuestionBank } from './questions/questionBank.js';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers, type IoServer } from './socket/registerHandlers.js';

export function createJinxoServer() {
  const questions = QuestionBank.fromFiles();
  const rooms = new RoomManager({ config: gameConfig, scoring: scoringConfig, questions });

  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, questions: questions.questions.length });
  });

  // production: เสิร์ฟหน้าเว็บที่ build แล้วจาก process เดียวกัน (deploy ง่าย, ไม่มีปัญหา CORS)
  const clientDist = resolve(process.env.CLIENT_DIST ?? resolve(SERVER_ROOT, '../client/dist'));
  if (existsSync(resolve(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
  }

  const httpServer = createServer(app);
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim());
  const io: IoServer = new Server(httpServer, {
    cors: corsOrigin ? { origin: corsOrigin } : undefined,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 16_000,
  });
  registerHandlers(io, rooms);
  return { app, httpServer, io, rooms, questions, hasClient: existsSync(resolve(clientDist, 'index.html')) };
}
