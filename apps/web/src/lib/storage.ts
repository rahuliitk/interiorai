import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export function generateStorageKey(filename: string): string {
  const ext = path.extname(filename);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `${date}/${randomUUID()}${ext}`;
}

export async function saveFile(buffer: Buffer, key: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, key);
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, buffer);
}

export async function getFile(key: string): Promise<Buffer | null> {
  const filePath = path.join(UPLOAD_DIR, key);
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, key);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist, ignore
  }
}
