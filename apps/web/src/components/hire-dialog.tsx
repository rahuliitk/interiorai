'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
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
  toast,
} from '@openlintel/ui';
import { UserPlus, Loader2 } from 'lucide-react';

interface HireDialogProps {
  contractorId: string;
  contractorName: string;
  trigger?: React.ReactNode;
}

const ROLES = [
  'General Contractor',
  'Interior Designer',
  'Architect',
  'Electrician',
  'Plumber',
  'Carpenter',
  'Painter',
  'HVAC Technician',
  'Flooring Specialist',
  'Project Manager',
  'Site Supervisor',
];

export function HireDialog({ contractorId, contractorName, trigger }: HireDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [role, setRole] = useState('');
  const [startDate, setStartDate] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');

  const { data: projects = [] } = trpc.project.list.useQuery(undefined, {
    enabled: open,
  });

  const assignContractor = trpc.contractor.assign.useMutation({
    onSuccess: () => {
      setOpen(false);
      setSelectedProject('');
      setRole('');
      setStartDate('');
      setAgreedAmount('');
      toast({
        title: 'Contractor hired',
        description: `${contractorName} has been assigned to the project.`,
      });
    },
    onError: () => {
      toast({ title: 'Failed to hire contractor', variant: 'destructive' });
    },
  });

  const handleHire = () => {
    if (!selectedProject || !role) return;
    assignContractor.mutate({
      contractorId,
      projectId: selectedProject,
      role,
      startDate: startDate ? new Date(startDate) : undefined,
      agreedAmount: agreedAmount ? parseFloat(agreedAmount) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <UserPlus className="mr-1 h-4 w-4" />
            Hire
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hire {contractorName}</DialogTitle>
          <DialogDescription>
            Assign this contractor to one of your projects.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Project selection */}
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No projects found. Create a project first.
              </p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Define role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start date */}
          <div className="space-y-2">
            <Label htmlFor="hire-start-date">Start Date</Label>
            <Input
              id="hire-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Agreed amount */}
          <div className="space-y-2">
            <Label htmlFor="hire-amount">Agreed Amount ($)</Label>
            <Input
              id="hire-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={agreedAmount}
              onChange={(e) => setAgreedAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleHire}
            disabled={assignContractor.isPending || !selectedProject || !role}
          >
            {assignContractor.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Hiring...
              </>
            ) : (
              'Confirm Hire'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
