'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
  DialogFooter,
} from '@openlintel/ui';
import { Plus, X, Camera } from 'lucide-react';

interface SiteLogFormData {
  date: Date;
  title: string;
  notes: string;
  weather: string;
  workersOnSite: number;
  photoKeys: string[];
  tags: string[];
}

interface SiteLogFormProps {
  onSubmit: (data: SiteLogFormData) => void;
  isPending?: boolean;
  onCancel?: () => void;
  initialData?: Partial<SiteLogFormData>;
}

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Hot', 'Cold'];

const SUGGESTED_TAGS = [
  'progress',
  'issue',
  'safety',
  'quality',
  'material-delivery',
  'inspection',
  'rework',
  'delay',
];

export function SiteLogForm({ onSubmit, isPending, onCancel, initialData }: SiteLogFormProps) {
  const [date, setDate] = useState(
    initialData?.date
      ? new Date(initialData.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  );
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [weather, setWeather] = useState(initialData?.weather ?? '');
  const [workersOnSite, setWorkersOnSite] = useState(initialData?.workersOnSite ?? 0);
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [photoKeys] = useState<string[]>(initialData?.photoKeys ?? []);

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      date: new Date(date),
      title: title.trim(),
      notes: notes.trim(),
      weather,
      workersOnSite,
      photoKeys,
      tags,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="log-date">Date</Label>
          <Input
            id="log-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-title">Title</Label>
          <Input
            id="log-title"
            placeholder="e.g. Day 15 — Flooring started"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="log-notes">Notes</Label>
        <Textarea
          id="log-notes"
          placeholder="Describe the work done, issues encountered, etc."
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Weather</Label>
          <Select value={weather} onValueChange={setWeather}>
            <SelectTrigger>
              <SelectValue placeholder="Select weather" />
            </SelectTrigger>
            <SelectContent>
              {WEATHER_OPTIONS.map((w) => (
                <SelectItem key={w} value={w.toLowerCase()}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-workers">Workers on Site</Label>
          <Input
            id="log-workers"
            type="number"
            min={0}
            value={workersOnSite}
            onChange={(e) => setWorkersOnSite(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
          />
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-gray-50 hover:text-foreground"
            >
              <Plus className="h-2.5 w-2.5" />
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Photo upload placeholder */}
      <div className="space-y-2">
        <Label>Photos</Label>
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-center">
          <div>
            <Camera className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag photos here or click to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload photos via the project uploads section
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || !title.trim()}>
          {isPending ? 'Saving...' : 'Save Site Log'}
        </Button>
      </DialogFooter>
    </form>
  );
}
