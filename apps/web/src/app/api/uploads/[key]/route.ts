import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getFile } from '@/lib/storage';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  // The key comes URL-encoded with slashes as path segments
  const decodedKey = decodeURIComponent(key);
  const buffer = await getFile(decodedKey);

  if (!buffer) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const ext = '.' + decodedKey.split('.').pop()?.toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
