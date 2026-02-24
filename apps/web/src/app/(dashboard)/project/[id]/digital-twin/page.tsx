'use client';

import { use, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
} from '@openlintel/ui';
import {
  Cpu,
  Plus,
  Trash2,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Thermometer,
  Droplets,
  Activity,
} from 'lucide-react';

const DEVICE_TYPES = [
  'temperature',
  'humidity',
  'motion',
  'smoke',
  'water_leak',
  'energy_meter',
  'air_quality',
  'occupancy',
] as const;

const EMERGENCY_REF_TYPES = [
  'fire_extinguisher',
  'fire_exit',
  'first_aid',
  'emergency_shutoff',
  'assembly_point',
  'defibrillator',
] as const;

function deviceTypeIcon(type: string) {
  switch (type) {
    case 'temperature':
      return <Thermometer className="h-4 w-4" />;
    case 'humidity':
    case 'water_leak':
      return <Droplets className="h-4 w-4" />;
    case 'energy_meter':
    case 'air_quality':
      return <Activity className="h-4 w-4" />;
    default:
      return <Wifi className="h-4 w-4" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'online':
      return (
        <Badge className="bg-green-100 text-green-800 text-xs">
          <Wifi className="mr-1 h-3 w-3" />
          Online
        </Badge>
      );
    case 'offline':
      return (
        <Badge className="bg-red-100 text-red-800 text-xs">
          <WifiOff className="mr-1 h-3 w-3" />
          Offline
        </Badge>
      );
    case 'warning':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 text-xs">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Warning
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs">
          {status}
        </Badge>
      );
  }
}

function emergencyTypeBadge(type: string) {
  const colors: Record<string, string> = {
    fire_extinguisher: 'bg-red-100 text-red-800',
    fire_exit: 'bg-orange-100 text-orange-800',
    first_aid: 'bg-green-100 text-green-800',
    emergency_shutoff: 'bg-yellow-100 text-yellow-800',
    assembly_point: 'bg-blue-100 text-blue-800',
    defibrillator: 'bg-purple-100 text-purple-800',
  };
  const colorClass = colors[type] || 'bg-gray-100 text-gray-800';
  return (
    <Badge className={`${colorClass} text-xs`}>
      {type.replace(/_/g, ' ')}
    </Badge>
  );
}

export default function DigitalTwinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [addRefOpen, setAddRefOpen] = useState(false);

  // Device form state
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [deviceRoomId, setDeviceRoomId] = useState('');

  // Emergency ref form state
  const [refType, setRefType] = useState('');
  const [refLocation, setRefLocation] = useState('');
  const [refDescription, setRefDescription] = useState('');

  // ── tRPC queries ──
  const { data: twin, isLoading: loadingTwin } = trpc.digitalTwin.getTwin.useQuery({ projectId });

  const digitalTwinId = twin?.id ?? '';

  const { data: devices = [], isLoading: loadingDevices } = trpc.digitalTwin.listDevices.useQuery(
    { digitalTwinId },
    { enabled: Boolean(digitalTwinId) },
  );

  const { data: emergencyRefs = [], isLoading: loadingRefs } =
    trpc.digitalTwin.listEmergencyRefs.useQuery({ projectId });

  const { data: dashboard, isLoading: loadingDashboard } =
    trpc.digitalTwin.getDashboard.useQuery(
      { projectId },
      { enabled: Boolean(digitalTwinId) },
    );

  // ── tRPC mutations ──
  const createTwin = trpc.digitalTwin.createTwin.useMutation({
    onSuccess: () => {
      utils.digitalTwin.getTwin.invalidate({ projectId });
      toast({ title: 'Digital twin created', description: 'Your digital twin is ready.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create digital twin', description: err.message });
    },
  });

  const addDevice = trpc.digitalTwin.addDevice.useMutation({
    onSuccess: () => {
      utils.digitalTwin.listDevices.invalidate({ digitalTwinId });
      utils.digitalTwin.getDashboard.invalidate({ projectId });
      setAddDeviceOpen(false);
      setDeviceName('');
      setDeviceType('');
      setDeviceRoomId('');
      toast({ title: 'Device added' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add device', description: err.message });
    },
  });

  const removeDevice = trpc.digitalTwin.removeDevice.useMutation({
    onSuccess: () => {
      utils.digitalTwin.listDevices.invalidate({ digitalTwinId });
      utils.digitalTwin.getDashboard.invalidate({ projectId });
      toast({ title: 'Device removed' });
    },
    onError: (err) => {
      toast({ title: 'Failed to remove device', description: err.message });
    },
  });

  const addEmergencyRef = trpc.digitalTwin.addEmergencyRef.useMutation({
    onSuccess: () => {
      utils.digitalTwin.listEmergencyRefs.invalidate({ projectId });
      setAddRefOpen(false);
      setRefType('');
      setRefLocation('');
      setRefDescription('');
      toast({ title: 'Emergency reference added' });
    },
    onError: (err) => {
      toast({ title: 'Failed to add reference', description: err.message });
    },
  });

  const removeEmergencyRef = trpc.digitalTwin.removeEmergencyRef.useMutation({
    onSuccess: () => {
      utils.digitalTwin.listEmergencyRefs.invalidate({ projectId });
      toast({ title: 'Emergency reference removed' });
    },
    onError: (err) => {
      toast({ title: 'Failed to remove reference', description: err.message });
    },
  });

  // ── Handlers ──
  const handleCreateTwin = () => {
    createTwin.mutate({ projectId });
  };

  const handleAddDevice = () => {
    if (!deviceName.trim() || !deviceType) {
      toast({ title: 'Please fill in device name and type' });
      return;
    }
    addDevice.mutate({
      digitalTwinId,
      name: deviceName.trim(),
      deviceType: deviceType as 'temperature' | 'humidity' | 'motion' | 'energy' | 'water',
      roomId: deviceRoomId.trim() || undefined,
    });
  };

  const handleRemoveDevice = (deviceId: string) => {
    removeDevice.mutate({ id: deviceId });
  };

  const handleAddEmergencyRef = () => {
    if (!refType || !refLocation.trim()) {
      toast({ title: 'Please fill in type and location' });
      return;
    }
    addEmergencyRef.mutate({
      projectId,
      type: refType as 'water_shutoff' | 'gas_shutoff' | 'electrical_breaker' | 'fire_extinguisher',
      label: refLocation.trim(),
      description: refDescription.trim() || undefined,
    });
  };

  const handleRemoveEmergencyRef = (refId: string) => {
    removeEmergencyRef.mutate({ id: refId });
  };

  // ── Loading state ──
  if (loadingTwin) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // ── No twin: CTA ──
  if (!twin) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Cpu className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Digital Twin</h1>
            <p className="text-sm text-muted-foreground">
              Create a digital twin to monitor IoT sensors and emergency infrastructure.
            </p>
          </div>
        </div>

        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Cpu className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Digital Twin</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Set up a digital twin for this project to connect IoT sensors, track device readings,
            and manage emergency references in real time.
          </p>
          <Button onClick={handleCreateTwin} disabled={createTwin.isPending}>
            {createTwin.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Create Digital Twin
          </Button>
        </Card>
      </div>
    );
  }

  // ── Dashboard stats ──
  const deviceCount = dashboard?.deviceCount ?? devices.length;
  const activeCount = dashboard?.activeCount ?? devices.filter((d: any) => d.status === 'online').length;
  const offlineCount = dashboard?.offlineCount ?? devices.filter((d: any) => d.status === 'offline').length;
  const latestReadings = dashboard?.latestReadings ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
          <Cpu className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Digital Twin</h1>
          <p className="text-sm text-muted-foreground">
            Monitor IoT sensors, device status, and emergency references.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="sensors">
            <Wifi className="mr-1.5 h-3.5 w-3.5" />
            IoT Sensors
          </TabsTrigger>
          <TabsTrigger value="emergency">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            Emergency References
          </TabsTrigger>
        </TabsList>

        {/* ===== DASHBOARD TAB ===== */}
        <TabsContent value="dashboard" className="space-y-6">
          {loadingDashboard ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <Cpu className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Devices</p>
                        <p className="text-2xl font-bold tabular-nums">{deviceCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
                        <Wifi className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-2xl font-bold tabular-nums text-green-600">{activeCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
                        <WifiOff className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Offline</p>
                        <p className="text-2xl font-bold tabular-nums text-red-600">{offlineCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Latest readings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Latest Readings</CardTitle>
                  <CardDescription>
                    Most recent sensor data grouped by device type
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {latestReadings.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Device
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Type
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Value
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Status
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Last Updated
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestReadings.map((reading: any, idx: number) => (
                            <tr key={idx} className="border-b hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium">
                                <div className="flex items-center gap-2">
                                  {deviceTypeIcon(reading.deviceType)}
                                  {reading.deviceName}
                                </div>
                              </td>
                              <td className="px-3 py-2 capitalize text-muted-foreground">
                                {reading.deviceType?.replace(/_/g, ' ')}
                              </td>
                              <td className="px-3 py-2 tabular-nums font-mono">
                                {reading.value} {reading.unit ?? ''}
                              </td>
                              <td className="px-3 py-2">
                                {statusBadge(reading.status)}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {reading.timestamp
                                  ? new Date(reading.timestamp).toLocaleString()
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Activity className="mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No readings yet. Add IoT sensors to start collecting data.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===== IOT SENSORS TAB ===== */}
        <TabsContent value="sensors" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">IoT Sensors</h2>
              <p className="text-sm text-muted-foreground">
                Manage connected devices and sensors for this project.
              </p>
            </div>
            <Dialog open={addDeviceOpen} onOpenChange={setAddDeviceOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Device
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add IoT Device</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="device-name">Device Name</Label>
                    <Input
                      id="device-name"
                      placeholder="e.g. Living Room Thermostat"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device-type">Device Type</Label>
                    <Select value={deviceType} onValueChange={setDeviceType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select device type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device-room">Room ID (optional)</Label>
                    <Input
                      id="device-room"
                      placeholder="e.g. room-uuid"
                      value={deviceRoomId}
                      onChange={(e) => setDeviceRoomId(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddDeviceOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddDevice} disabled={addDevice.isPending}>
                    {addDevice.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-4 w-4" />
                    )}
                    Add Device
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loadingDevices ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map((device: any) => (
                <Card key={device.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        {deviceTypeIcon(device.deviceType)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{device.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {device.deviceType?.replace(/_/g, ' ')}
                          {device.roomId && (
                            <span> &middot; Room: {device.roomId}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {statusBadge(device.status ?? 'offline')}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDevice(device.id)}
                        disabled={removeDevice.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {removeDevice.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Wifi className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Devices Connected</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Add IoT sensors and devices to start monitoring your project in real time.
              </p>
              <Button size="sm" onClick={() => setAddDeviceOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add First Device
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* ===== EMERGENCY REFERENCES TAB ===== */}
        <TabsContent value="emergency" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Emergency References</h2>
              <p className="text-sm text-muted-foreground">
                Track fire safety equipment, exits, and emergency infrastructure.
              </p>
            </div>
            <Dialog open={addRefOpen} onOpenChange={setAddRefOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Reference
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Emergency Reference</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="ref-type">Type</Label>
                    <Select value={refType} onValueChange={setRefType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMERGENCY_REF_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref-location">Location</Label>
                    <Input
                      id="ref-location"
                      placeholder="e.g. Ground Floor, near stairwell B"
                      value={refLocation}
                      onChange={(e) => setRefLocation(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref-description">Description (optional)</Label>
                    <Input
                      id="ref-description"
                      placeholder="e.g. 10kg ABC dry powder"
                      value={refDescription}
                      onChange={(e) => setRefDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddRefOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddEmergencyRef} disabled={addEmergencyRef.isPending}>
                    {addEmergencyRef.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-4 w-4" />
                    )}
                    Add Reference
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loadingRefs ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : emergencyRefs.length > 0 ? (
            <div className="space-y-3">
              {emergencyRefs.map((ref: any) => (
                <Card key={ref.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{ref.location}</p>
                          {emergencyTypeBadge(ref.type)}
                        </div>
                        {ref.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ref.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveEmergencyRef(ref.id)}
                      disabled={removeEmergencyRef.isPending}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {removeEmergencyRef.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Emergency References</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Add emergency infrastructure references such as fire extinguishers,
                exits, first aid kits, and assembly points.
              </p>
              <Button size="sm" onClick={() => setAddRefOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add First Reference
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
