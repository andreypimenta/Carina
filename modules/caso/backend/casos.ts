// The case of the week in the admin and in the weekly edition. The editor writes a case for one edition and
// publishes it; it stays editable, so the answer can be written during the week. A weekly edition shows its
// own case and the answer to the one before (weeklyPart), read as they are now, so a correction or a
// withdrawal shows at once. The picture is re-encoded on arrival: what the camera or the scanner wrote into
// the file (place, date, device, names) does not reach the site, and a replaced or removed picture is deleted.
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { BeforeJson } from "@aihot/contracts/admin";
import { beijingAt, beijingDate, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";
import { EDITION_TIMES } from "@aihot/site";
import { audit, auditHistory, Conflict } from "@aihot/backend/audit";
import { config } from "@aihot/backend/config";
import { sql, type Db } from "@aihot/backend/db";
import { sha256 } from "@aihot/backend/lib/ids";
import type { ReportIssue } from "@aihot/backend/modules";
import {
  DEFAULT_QUESTION, editionDay, editionLabel, MAX_IMAGE_BYTES, MAX_OPTIONS, nextWeek, previousWeek, type AdminCaso, type AdminCasoRow, type AdminCasos,
  type CasoCard, type CasoImagem, type CasoPart, type CasoResposta, type CasoStatus,
} from "../caso.ts";

interface Row {
  id: number;
  week: string;
  title: string;
  body: string;
  image: string | null;
  image_width: number | null;
  image_height: number | null;
  image_caption: string | null;
  question: string;
  options: string[];
  correct: number | null;
  answer: string | null;
  status: CasoStatus;
  created_by: string;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const IMAGE_DIR = () => path.join(config.dataDir, "uploads", "caso");
export const IMAGE_FILE = /^caso-[0-9a-f]{16}\.jpg$/;
const MAX_SIDE = 1600;
/** How many editions ahead the admin offers. */
const WEEKS_AHEAD = 8;

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
const versionOf = (row: Pick<Row, "updated_at">) => row.updated_at.toISOString();
const subject = (id: number) => `caso:${id}`;

/** The edition that comes out next: this week's, or last week's on a Monday before it is out. */
export function upcomingWeek(now = new Date()): string {
  const week = isoWeekLabel(beijingDate(now));
  const before = previousWeek(week)!;
  return beijingAt(editionDay(before)!, EDITION_TIMES.weekly) > now ? before : week;
}

/** The picture the editor sent, as the site keeps it: a JPEG at most MAX_SIDE wide or tall, without the file's metadata. */
async function storeImage(dataUrl: string): Promise<{ file: string; width: number; height: number }> {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw bad("A imagem precisa ser PNG, JPG ou WebP");
  const data = Buffer.from(m[2]!, "base64");
  if (data.length > MAX_IMAGE_BYTES) throw bad(`A imagem pode ter no máximo ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  // rotate() turns it the way the camera held it; the output keeps no EXIF, XMP, IPTC or ICC data.
  const out = await sharp(data, { limitInputPixels: 60_000_000, failOn: "error" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
    .catch(() => { throw bad("Não foi possível ler a imagem; tente outro arquivo"); });
  const file = `caso-${sha256(out.data).slice(0, 16)}.jpg`;
  await mkdir(IMAGE_DIR(), { recursive: true });
  await writeFile(path.join(IMAGE_DIR(), file), out.data);
  return { file, width: out.info.width, height: out.info.height };
}

/** Deletes a picture no case uses any more. */
async function dropUnused(file: string | null): Promise<void> {
  if (!file) return;
  const [used] = await sql`SELECT 1 FROM caso_semana WHERE image = ${file}`;
  if (!used) await unlink(path.join(IMAGE_DIR(), file)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

const Base = z.object({
  week: z.string().refine((w) => isoWeekRange(w) !== null, "semana inválida"),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(5000),
  question: z.string().trim().max(300).default(""),
  options: z.array(z.string().trim().max(300)).max(MAX_OPTIONS).default([]).transform((v) => v.filter(Boolean)),
  correct: z.number().int().min(0).nullable().default(null),
  answer: z.string().trim().max(8000).default(""),
  imageCaption: z.string().trim().max(300).default(""),
  /** A new picture as a data URL; null takes the picture off; left out keeps it. */
  image: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 1.4)).nullable().optional(),
});
const checked = <T extends typeof Base>(schema: T) => schema
  .refine((b) => b.options.length !== 1, { message: "dê ao menos duas alternativas, ou nenhuma", path: ["options"] })
  .refine((b) => b.correct === null || b.correct < b.options.length, { message: "a alternativa certa precisa estar na lista", path: ["correct"] });
const Fields = checked(Base);
const Edit = checked(Base.extend({ version: z.string() }));
type Fields = z.infer<typeof Base>;

const columns = (b: Fields) => ({
  week: b.week, title: b.title, body: b.body.replace(/\r\n/g, "\n"), question: b.question || DEFAULT_QUESTION, options: b.options, correct: b.correct,
  answer: b.answer.replace(/\r\n/g, "\n") || null, image_caption: b.imageCaption || null,
});

/** What the audit keeps of a case: everything but the picture's bytes. */
const snapshot = (row: Row) => ({
  week: row.week, status: row.status, title: row.title, body: row.body, image: row.image, imageCaption: row.image_caption, question: row.question,
  options: row.options, correct: row.correct, answer: row.answer,
});

/** A week already taken, as the editor reads it. */
const weekTaken = (error: unknown, week: string) => {
  if ((error as { code?: string }).code === "23505") return new Conflict(`Já há um caso para a edição de ${editionLabel(week)}`);
  return error;
};

/** Runs `change` with the picture the input asks for stored first; a picture left unused (by a failure or a replacement) is deleted. */
async function withImage<T>(b: Fields, previous: string | null, change: (image: { file: string; width: number; height: number } | null | undefined) => Promise<T>): Promise<T> {
  const image = b.image === undefined || b.image === null ? b.image : await storeImage(b.image);
  try {
    return await change(image);
  } finally {
    if (image) await dropUnused(image.file);
    if (image !== undefined && previous !== image?.file) await dropUnused(previous);
  }
}

const imageColumns = (image: { file: string; width: number; height: number } | null | undefined) =>
  image === undefined ? {} : { image: image?.file ?? null, image_width: image?.width ?? null, image_height: image?.height ?? null };

export async function createCaso(input: unknown, actor: string): Promise<{ id: number }> {
  const b = Fields.parse(input);
  return withImage(b, null, async (image) => {
    try {
      return await sql.begin(async (tx) => {
        const values = { ...columns(b), ...imageColumns(image), created_by: actor };
        const [row] = await tx<Row[]>`INSERT INTO caso_semana ${tx(values as Record<string, unknown>)} RETURNING *`;
        await audit(actor, "caso.create", subject(row!.id), null, null, snapshot(row!), { db: tx });
        return { id: Number(row!.id) };
      });
    } catch (error) {
      throw weekTaken(error, b.week);
    }
  });
}

/** The row to change, locked, if it is as the editor saw it. */
async function lockFor(tx: Db, id: number, version: string): Promise<Row | null> {
  const [row] = await tx<Row[]>`SELECT * FROM caso_semana WHERE id = ${id} FOR UPDATE`;
  if (!row) return null;
  if (versionOf(row) !== version) throw new Conflict("Este caso foi alterado; atualize a página e tente de novo");
  return row;
}

async function save(tx: Db, before: Row, change: Record<string, unknown>, actor: string, action: string): Promise<Row> {
  const [after] = await tx<Row[]>`UPDATE caso_semana SET ${tx(change)}, updated_at = now() WHERE id = ${before.id} RETURNING *`;
  await audit(actor, `caso.${action}`, subject(before.id), null, snapshot(before), snapshot(after!), { db: tx });
  return after!;
}

/** The editor's changes, published or not: a published case shows them at once. */
export async function editCaso(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Edit.parse(input);
  const [current] = await sql<Pick<Row, "image">[]>`SELECT image FROM caso_semana WHERE id = ${id}`;
  if (!current) return null;
  return withImage(b, current.image, async (image) => {
    try {
      return await sql.begin(async (tx) => {
        const row = await lockFor(tx, id, b.version);
        if (!row) return null;
        if (row.image !== current.image) throw new Conflict("Este caso foi alterado; atualize a página e tente de novo");
        await save(tx, row, { ...columns(b), ...imageColumns(image) }, actor, "edit");
        return { id };
      });
    } catch (error) {
      throw weekTaken(error, b.week);
    }
  });
}

const Step = z.object({ version: z.string() });

export async function publishCaso(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Step.parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version);
    if (!row) return null;
    if (row.status === "publicado") throw new Conflict("Este caso já está publicado");
    await save(tx, row, { status: "publicado", published_at: new Date() }, actor, "publish");
    return { id };
  });
}

/** A published case off the site: its edition no longer shows it, nor the next one its answer. */
export async function withdrawCaso(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Step.parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version);
    if (!row) return null;
    if (row.status !== "publicado") throw new Conflict("Este caso não está publicado");
    await save(tx, row, { status: "rascunho" }, actor, "withdraw");
    return { id };
  });
}

/** A draft deleted with its picture; the audit keeps its text. */
export async function deleteCaso(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Step.parse(input);
  const deleted = await sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version);
    if (!row) return null;
    if (row.status === "publicado") throw new Conflict("Retire o caso do ar antes de apagá-lo");
    await tx`DELETE FROM caso_semana WHERE id = ${id}`;
    await audit(actor, "caso.delete", subject(id), null, snapshot(row), null, { db: tx });
    return row;
  });
  if (!deleted) return null;
  await dropUnused(deleted.image);
  return { id };
}

// ── In the admin ─────────────────────────────────────────────────────────────────────────────────────

const imageOf = (r: Row, base: string): CasoImagem | null =>
  r.image ? { url: `${base}/${r.image}`, width: r.image_width ?? MAX_SIDE, height: r.image_height ?? MAX_SIDE, caption: r.image_caption } : null;

const adminRow = (r: Row): AdminCasoRow => ({
  id: Number(r.id), week: r.week, title: r.title, status: r.status, hasImage: !!r.image, hasAnswer: !!r.answer?.trim(), updatedAt: r.updated_at.toISOString(),
});

/** The upcoming edition and the next ones, without those another case has. */
async function freeWeeks(own: string | null, now: Date): Promise<string[]> {
  const weeks = [upcomingWeek(now)];
  while (weeks.length < WEEKS_AHEAD) weeks.push(nextWeek(weeks.at(-1)!)!);
  const taken = new Set((await sql<{ week: string }[]>`SELECT week FROM caso_semana WHERE week IN ${sql(weeks)}`).map((r) => r.week));
  const free = weeks.filter((w) => w === own || !taken.has(w));
  return own && !free.includes(own) ? [own, ...free] : free;
}

export async function listCasos(now = new Date()): Promise<AdminCasos> {
  const rows = await sql<Row[]>`SELECT * FROM caso_semana ORDER BY week DESC LIMIT 200`;
  return { rows: rows.map(adminRow), weeks: await freeWeeks(null, now) };
}

export const ADMIN_IMAGES = "/api/admin/caso/imagens";
export const PUBLIC_IMAGES = "/caso/imagens";

export async function casoDetail(id: number, now = new Date()): Promise<BeforeJson<AdminCaso> | null> {
  const [r] = await sql<Row[]>`SELECT * FROM caso_semana WHERE id = ${id}`;
  if (!r) return null;
  return {
    ...adminRow(r), body: r.body, image: imageOf(r, ADMIN_IMAGES), question: r.question, options: r.options, correct: r.correct, answer: r.answer,
    createdBy: r.created_by, createdAt: r.created_at.toISOString(), publishedAt: r.published_at?.toISOString() ?? null, weeks: await freeWeeks(r.week, now), version: versionOf(r),
    history: await auditHistory(subject(id)),
  };
}

/**
 * What the editor still has to do for the next edition: its case to publish, and the answer to the case
 * before it, which that edition shows. The admin navigation's badge.
 */
export async function pending(now = new Date()): Promise<number> {
  const week = upcomingWeek(now);
  const rows = await sql<Pick<Row, "week" | "answer">[]>`SELECT week, answer FROM caso_semana WHERE status = 'publicado' AND week IN (${week}, ${previousWeek(week)!})`;
  const own = rows.find((r) => r.week === week);
  const before = rows.find((r) => r.week !== week);
  return (own ? 0 : 1) + (before && !before.answer?.trim() ? 1 : 0);
}

/** Whether a picture belongs to a case (`published`: to a published one), for the routes that send it. */
export async function imageShown(file: string, published: boolean): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM caso_semana WHERE image = ${file} AND (${!published} OR status = 'publicado') LIMIT 1`;
  return !!row;
}

// ── In the weekly edition ────────────────────────────────────────────────────────────────────────────

const card = (r: Row): CasoCard => ({
  week: r.week, title: r.title, body: r.body, image: imageOf(r, PUBLIC_IMAGES), question: r.question, options: r.options, answerOn: editionLabel(nextWeek(r.week)!),
});

const resposta = (r: Row): CasoResposta => ({ week: r.week, title: r.title, question: r.question, options: r.options, correct: r.correct, answer: r.answer! });

/** A weekly edition's case and the answer to the one before it, published, as they are now; nothing for the other issues. */
export async function weeklyPart(issue: ReportIssue): Promise<CasoPart | null> {
  if (issue.kind !== "weekly") return null;
  const before = previousWeek(issue.key);
  if (!before) return null;
  const rows = await sql<Row[]>`SELECT * FROM caso_semana WHERE status = 'publicado' AND week IN (${issue.key}, ${before})`;
  const own = rows.find((r) => r.week === issue.key);
  const answered = rows.find((r) => r.week === before && r.answer?.trim());
  if (!own && !answered) return null;
  return { caso: own ? card(own) : null, resposta: answered ? resposta(answered) : null };
}
