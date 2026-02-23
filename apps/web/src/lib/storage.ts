import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const BUCKET = process.env.MINIO_BUCKET || 'openlintel';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

export function generateStorageKey(filename: string): string {
  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `${date}/${randomUUID()}${ext}`;
}

export async function saveFile(buffer: Buffer, key: string, contentType?: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

export async function getFile(key: string): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const stream = response.Body;
    if (!stream) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
    );
  } catch {
    // File may not exist, ignore
  }
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}
