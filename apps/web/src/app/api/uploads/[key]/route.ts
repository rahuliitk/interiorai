import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPresignedUrl } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  try {
    const url = await getPresignedUrl(decodedKey);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
