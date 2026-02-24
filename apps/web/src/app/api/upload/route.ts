import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { auth } from '@/lib/auth';
import { db, uploads, projects, rooms, eq, and } from '@openlintel/db';
import { saveFile, generateStorageKey } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function computeImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 32);
}

async function generateThumbnail(
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer | null> {
  if (!IMAGE_TYPES.includes(mimeType)) return null;
  try {
    // Dynamic import to avoid issues if sharp is not installed
    const sharp = (await import('sharp')).default;
    return await sharp(buffer)
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string | null;
  const roomId = formData.get('roomId') as string | null;
  const category = (formData.get('category') as string) || 'photo';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  // Verify ownership if projectId or roomId is provided
  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
  }

  if (roomId) {
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.id, roomId),
      with: { project: true },
    });
    if (!room || room.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = generateStorageKey(file.name);
  await saveFile(buffer, storageKey, file.type);

  // Generate thumbnail for images
  let thumbnailKey: string | null = null;
  const thumbnail = await generateThumbnail(buffer, file.type);
  if (thumbnail) {
    thumbnailKey = storageKey.replace(/\.[^.]+$/, '_thumb.jpg');
    await saveFile(thumbnail, thumbnailKey, 'image/jpeg');
  }

  // Compute image hash for deduplication
  const imageHash = IMAGE_TYPES.includes(file.type) ? computeImageHash(buffer) : null;

  const [upload] = await db
    .insert(uploads)
    .values({
      userId: session.user.id,
      projectId,
      roomId,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey,
      category,
      thumbnailKey,
      imageHash,
    })
    .returning();

  return NextResponse.json(upload);
}
