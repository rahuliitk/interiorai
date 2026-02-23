import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@openlintel/db';
import { uploads, projects, rooms } from '@openlintel/db';
import { eq, and } from 'drizzle-orm';
import { saveFile, generateStorageKey } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

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
    })
    .returning();

  return NextResponse.json(upload);
}
