import fs from "node:fs/promises";
import path from "node:path";
import type { Book, TimelineEvent } from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

export async function getBooks(): Promise<Book[]> {
  return readJson<Book[]>("books.json");
}

export async function getBook(slug: string): Promise<Book | undefined> {
  const books = await getBooks();
  return books.find((b) => b.slug === slug);
}

export async function getEventsForBook(slug: string): Promise<TimelineEvent[]> {
  try {
    return await readJson<TimelineEvent[]>(`${slug}.events.json`);
  } catch {
    return [];
  }
}

export async function getAllEvents(): Promise<TimelineEvent[]> {
  const books = await getBooks();
  const all = await Promise.all(books.map((b) => getEventsForBook(b.slug)));
  return all.flat().sort(compareEvents);
}

export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.date.year !== b.date.year) return a.date.year - b.date.year;
  const am = a.date.month ?? 0;
  const bm = b.date.month ?? 0;
  if (am !== bm) return am - bm;
  const ad = a.date.day ?? 0;
  const bd = b.date.day ?? 0;
  return ad - bd;
}

export function buildBookIndex(books: Book[]): Record<string, Book> {
  return Object.fromEntries(books.map((b) => [b.slug, b]));
}
