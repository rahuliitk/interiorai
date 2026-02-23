import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const BOM_SERVICE_URL = process.env.BOM_SERVICE_URL || 'http://localhost:8002';

/**
 * Proxy binary export files (XLSX/PDF) from the internal bom-engine service.
 * The bom-engine is not publicly accessible, so this route streams the response.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bomId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bomId } = await params;
  const format = request.nextUrl.searchParams.get('format') || 'xlsx';

  if (!['xlsx', 'pdf'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use xlsx or pdf.' }, { status: 400 });
  }

  try {
    const serviceUrl = `${BOM_SERVICE_URL}/api/v1/bom/${bomId}/export?format=${format}`;
    const res = await fetch(serviceUrl);

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Export service error');
      return NextResponse.json(
        { error: `Export failed: ${errorText}` },
        { status: res.status },
      );
    }

    const contentType =
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

    const ext = format === 'xlsx' ? 'xlsx' : 'pdf';
    const filename = `bom-${bomId.slice(0, 8)}.${ext}`;

    const blob = await res.arrayBuffer();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'BOM export service is unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
