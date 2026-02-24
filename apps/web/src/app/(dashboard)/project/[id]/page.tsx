'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Skeleton,
  Separator,
} from '@openlintel/ui';
import { Plus, ArrowLeft, Trash2 } from 'lucide-react';

const ROOM_TYPES = [
  'living_room', 'bedroom', 'kitchen', 'bathroom', 'dining', 'study',
  'balcony', 'utility', 'foyer', 'corridor', 'pooja_room', 'store', 'garage', 'terrace', 'other',
] as const;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState<string>('other');
  const [lengthMm, setLengthMm] = useState('');
  const [widthMm, setWidthMm] = useState('');

  const utils = trpc.useUtils();
  const { data: project, isLoading } = trpc.project.byId.useQuery({ id });

  const createRoom = trpc.room.create.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id });
      setOpen(false);
      setRoomName('');
      setRoomType('other');
      setLengthMm('');
      setWidthMm('');
    },
  });

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      router.push('/dashboard');
    },
  });

  const handleCreateRoom = () => {
    if (!roomName.trim()) return;
    createRoom.mutate({
      projectId: id,
      name: roomName.trim(),
      type: roomType,
      lengthMm: lengthMm ? Number(lengthMm) : undefined,
      widthMm: widthMm ? Number(widthMm) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            {project.address && (
              <p className="text-sm text-muted-foreground">{project.address}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{project.status.replace('_', ' ')}</Badge>
              <span className="text-xs text-muted-foreground">
                {project.unitSystem === 'metric' ? 'Metric' : 'Imperial'}
              </span>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('Delete this project? This cannot be undone.')) {
                deleteProject.mutate({ id });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rooms</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Room</DialogTitle>
              <DialogDescription>Add a room to this project.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="e.g. Master Bedroom"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-type">Room Type</Label>
                <Select value={roomType} onValueChange={setRoomType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="length">Length (mm)</Label>
                  <Input
                    id="length"
                    type="number"
                    placeholder="e.g. 4000"
                    value={lengthMm}
                    onChange={(e) => setLengthMm(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width (mm)</Label>
                  <Input
                    id="width"
                    type="number"
                    placeholder="e.g. 3500"
                    value={widthMm}
                    onChange={(e) => setWidthMm(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRoom} disabled={createRoom.isPending || !roomName.trim()}>
                {createRoom.isPending ? 'Adding...' : 'Add Room'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {((project as any).rooms ?? []).length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center">
          <CardDescription className="mb-4">
            No rooms yet. Add rooms to start designing.
          </CardDescription>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add First Room
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {((project as any).rooms ?? []).map((room: any) => (
            <Link key={room.id} href={`/project/${id}/rooms/${room.id}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-base">{room.name}</CardTitle>
                  <CardDescription>
                    {room.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    {room.floor !== null && room.floor !== 0 && ` · Floor ${room.floor}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {room.lengthMm && room.widthMm ? (
                    <p className="text-sm text-muted-foreground">
                      {room.lengthMm} × {room.widthMm} mm
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Dimensions not set</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
