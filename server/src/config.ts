import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { PublicGameConfig, PublicScoringConfig } from '@jinxo/shared';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, '..');

const gameSchema = z
  .object({
    minPlayers: z.number().int().min(2),
    maxPlayers: z.number().int().max(30),
    rounds: z.number().int().min(1).max(10),
    topicsPerRound: z.number().int().min(1).max(9),
    answersPerTopic: z.number().int().min(1).max(9),
    maxAnswerLength: z.number().int().min(5).max(100),
    maxNameLength: z.number().int().min(3).max(30),
    maxQuestionLength: z.number().int().min(10).max(200).default(80),
    disconnectGraceMs: z.number().int().min(0),
    hostTransferGraceMs: z.number().int().min(0),
    lobbyDisconnectRemoveMs: z.number().int().min(0),
    emptyRoomTtlMs: z.number().int().min(10_000),
  })
  .refine((c) => c.minPlayers <= c.maxPlayers, 'minPlayers ต้องไม่เกิน maxPlayers')
  .refine(
    (c) => c.topicsPerRound * c.answersPerTopic === 9,
    'topicsPerRound × answersPerTopic ต้องเท่ากับ 9 (จำนวนช่องบนกระดาน 3×3)',
  );

const tierSchema = z.object({
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(1).optional(),
  points: z.number(),
  kind: z.enum(['none', 'jinxo', 'match']),
});

const scoringSchema = z.object({
  tiers: z.array(tierSchema).min(1),
  lineBonus: z.object({
    enabled: z.boolean(),
    condition: z.enum(['matched', 'jinxo']),
    rows: z.tuple([z.number(), z.number(), z.number()]),
    columns: z.tuple([z.number(), z.number(), z.number()]),
    diagonals: z.tuple([z.number(), z.number()]).optional(),
  }),
});

export type GameConfig = z.infer<typeof gameSchema>;
export type ScoringConfig = PublicScoringConfig;

function loadJson<T>(file: string, schema: z.ZodType<T>): T {
  const path = resolve(SERVER_ROOT, file);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Config ไม่ถูกต้อง (${file}):\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const gameConfig: GameConfig = loadJson(
  process.env.JINXO_GAME_CONFIG ?? 'config/game.json',
  gameSchema,
);
export const scoringConfig: ScoringConfig = loadJson(
  process.env.JINXO_SCORING_CONFIG ?? 'config/scoring.json',
  scoringSchema,
);

export function publicGameConfig(c: GameConfig = gameConfig): PublicGameConfig {
  return {
    minPlayers: c.minPlayers,
    maxPlayers: c.maxPlayers,
    rounds: c.rounds,
    topicsPerRound: c.topicsPerRound,
    answersPerTopic: c.answersPerTopic,
    maxAnswerLength: c.maxAnswerLength,
    maxNameLength: c.maxNameLength,
    maxQuestionLength: c.maxQuestionLength,
  };
}
