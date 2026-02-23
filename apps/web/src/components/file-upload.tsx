'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, Progress } from '@openlintel/ui';
import { Upload, X, FileImage } from 'lucide-react';

interface FileUploadProps {
  projectId: string;
  roomId?: string;
  category?: string;
  onUploadComplete?: (upload: Record<string, unknown>) => void;
  accept?: string;
}

export function FileUpload({
  projectId,
  roomId,
  category = 'photo',
  onUploadComplete,
  accept = 'image/*,application/pdf',
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(10);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      if (roomId) formData.append('roomId', roomId);
      formData.append('category', category);

      try {
        setProgress(30);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        setProgress(80);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const upload = await res.json();
        setProgress(100);
        onUploadComplete?.(upload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setTimeout(() => {
          setUploading(false);
          setProgress(0);
        }, 500);
      }
    },
    [projectId, roomId, category, onUploadComplete],
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
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div>
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
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
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />

        {uploading ? (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4 animate-pulse" />
              Uploading...
            </div>
            <Progress value={progress} />
          </div>
        ) : (
          <>
            <FileImage className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-1 text-sm text-muted-foreground">
              Drag and drop a file here, or
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Choose File
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Images and PDFs up to 10MB
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
