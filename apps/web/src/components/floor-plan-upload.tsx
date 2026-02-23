'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Progress,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  toast,
} from '@openlintel/ui';
import { Upload, X, FileImage, FileText, CheckCircle2 } from 'lucide-react';
import { JobProgress } from './job-progress';

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/dxf',
  'application/dwg',
  'image/vnd.dxf',
  'application/acad',
  'application/x-acad',
];

const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp,.pdf,.dxf,.dwg';

interface FloorPlanUploadProps {
  projectId: string;
  onUploadComplete?: (upload: Record<string, unknown>) => void;
  onDigitizationComplete?: () => void;
}

type UploadPhase = 'idle' | 'uploading' | 'digitizing' | 'complete';

export function FloorPlanUpload({
  projectId,
  onUploadComplete,
  onDigitizationComplete,
}: FloorPlanUploadProps) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    filename: string;
    storageKey: string;
    mimeType: string;
  } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      // Validate file type
      const ext = file.name.split('.').pop()?.toLowerCase();
      const validExt = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'dxf', 'dwg'];
      if (!validExt.includes(ext ?? '')) {
        setError(
          `Unsupported file type. Accepted: ${validExt.join(', ')}`,
        );
        return;
      }

      setError(null);
      setPhase('uploading');
      setUploadProgress(10);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('category', 'floor_plan');

      try {
        setUploadProgress(30);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        setUploadProgress(70);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const upload = await res.json();
        setUploadProgress(100);
        setUploadedFile({
          filename: upload.filename ?? file.name,
          storageKey: upload.storageKey ?? '',
          mimeType: upload.mimeType ?? file.type,
        });

        // Generate preview for images
        if (file.type.startsWith('image/')) {
          setPreviewUrl(URL.createObjectURL(file));
        }

        onUploadComplete?.(upload);
        toast({ title: 'Floor plan uploaded' });

        // Start digitization automatically
        setPhase('digitizing');
        setUploadProgress(0);

        // Trigger floor plan digitization job
        try {
          const jobRes = await fetch('/api/jobs/floor-plan-digitize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              uploadId: upload.id,
              storageKey: upload.storageKey,
            }),
          });

          if (jobRes.ok) {
            const job = await jobRes.json();
            setJobId(job.id ?? null);
          } else {
            // Digitization service may not be available
            setPhase('complete');
            toast({
              title: 'Floor plan uploaded',
              description:
                'Digitization service unavailable. Floor plan saved as-is.',
            });
          }
        } catch {
          // Service unavailable - still mark as complete
          setPhase('complete');
          toast({
            title: 'Floor plan uploaded',
            description:
              'Digitization service unavailable. Floor plan saved as-is.',
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setPhase('idle');
        setUploadProgress(0);
      }
    },
    [projectId, onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setPhase('idle');
    setUploadedFile(null);
    setJobId(null);
    setPreviewUrl(null);
    setError(null);
    setUploadProgress(0);
  };

  if (phase === 'complete' || (phase === 'digitizing' && !jobId)) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <CardTitle className="text-base">Floor Plan Uploaded</CardTitle>
          </div>
          {uploadedFile && (
            <CardDescription>{uploadedFile.filename}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {previewUrl && (
            <div className="overflow-hidden rounded-lg border">
              <img
                src={previewUrl}
                alt="Floor plan preview"
                className="w-full"
              />
            </div>
          )}
          {uploadedFile && !previewUrl && (
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{uploadedFile.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {uploadedFile.mimeType}
                </p>
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleReset}>
            Upload Another
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'digitizing' && jobId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digitizing Floor Plan</CardTitle>
          <CardDescription>
            Converting your floor plan into a digital format with room
            detection...
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewUrl && (
            <div className="overflow-hidden rounded-lg border opacity-50">
              <img
                src={previewUrl}
                alt="Floor plan being processed"
                className="w-full"
              />
            </div>
          )}
          <JobProgress
            jobId={jobId}
            onComplete={() => {
              setPhase('complete');
              onDigitizationComplete?.();
              toast({ title: 'Floor plan digitized successfully' });
            }}
            onFailed={(err) => {
              setPhase('complete');
              toast({
                title: 'Digitization failed',
                description: err ?? 'Please try again.',
              });
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleChange}
        />

        {phase === 'uploading' ? (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4 animate-pulse" />
              Uploading floor plan...
            </div>
            <Progress value={uploadProgress} />
          </div>
        ) : (
          <>
            <FileImage className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-sm font-medium">Upload Floor Plan</h3>
            <p className="mb-3 text-center text-sm text-muted-foreground">
              Drag and drop your floor plan, or click to browse
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Choose File
            </Button>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {['DWG', 'DXF', 'PDF', 'PNG', 'JPG'].map((ext) => (
                <Badge key={ext} variant="secondary" className="text-xs">
                  {ext}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Max file size: 50MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1 text-sm text-destructive">
          <X className="h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
