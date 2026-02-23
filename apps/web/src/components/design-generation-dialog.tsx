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
  Badge,
  Textarea,
  toast,
} from '@openlintel/ui';
import { Sparkles, Plus, X } from 'lucide-react';
import { JobProgress } from './job-progress';

const DESIGN_STYLES = [
  'modern', 'contemporary', 'minimalist', 'scandinavian', 'industrial',
  'traditional', 'transitional', 'bohemian', 'coastal', 'rustic',
] as const;

const BUDGET_TIERS = ['economy', 'standard', 'premium', 'luxury'] as const;

interface DesignGenerationDialogProps {
  designVariantId: string;
  roomId: string;
  projectId: string;
  currentStyle?: string;
  currentBudget?: string;
  onGenerated?: () => void;
  trigger?: React.ReactNode;
}

export function DesignGenerationDialog({
  designVariantId,
  roomId,
  projectId,
  currentStyle = 'modern',
  currentBudget = 'standard',
  onGenerated,
  trigger,
}: DesignGenerationDialogProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(currentStyle);
  const [budget, setBudget] = useState(currentBudget);
  const [constraintInput, setConstraintInput] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'input' | 'progress'>('input');

  const utils = trpc.useUtils();

  const generateDesign = trpc.designVariant.generate.useMutation({
    onSuccess: (job) => {
      setJobId(job.id);
      setPhase('progress');
      toast({ title: 'Design generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to start generation', description: err.message });
    },
  });

  const addConstraint = () => {
    const trimmed = constraintInput.trim();
    if (trimmed && !constraints.includes(trimmed)) {
      setConstraints((prev) => [...prev, trimmed]);
      setConstraintInput('');
    }
  };

  const removeConstraint = (index: number) => {
    setConstraints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConstraintKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addConstraint();
    }
  };

  const handleGenerate = () => {
    generateDesign.mutate({
      designVariantId,
      style,
      budgetTier: budget,
      constraints: constraints.length > 0 ? constraints : undefined,
      additionalPrompt: additionalPrompt.trim() || undefined,
    });
  };

  const handleJobComplete = () => {
    utils.designVariant.listByProject.invalidate({ projectId });
    utils.designVariant.listByRoom.invalidate({ roomId });
    onGenerated?.();
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state when closing
      setPhase('input');
      setJobId(null);
      setConstraintInput('');
      setAdditionalPrompt('');
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Sparkles className="mr-1 h-4 w-4" />
            Generate AI Design
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {phase === 'input' ? (
          <>
            <DialogHeader>
              <DialogTitle>Generate AI Design</DialogTitle>
              <DialogDescription>
                Configure style, budget, and constraints for AI-powered design generation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Design Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGN_STYLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Budget Tier</Label>
                <Select value={budget} onValueChange={setBudget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Design Constraints</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Must keep existing flooring"
                    value={constraintInput}
                    onChange={(e) => setConstraintInput(e.target.value)}
                    onKeyDown={handleConstraintKeyDown}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addConstraint}
                    disabled={!constraintInput.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {constraints.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {constraints.map((constraint, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {constraint}
                        <button
                          onClick={() => removeConstraint(i)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Additional Instructions (Optional)</Label>
                <Textarea
                  placeholder="Any specific requirements or preferences..."
                  value={additionalPrompt}
                  onChange={(e) => setAdditionalPrompt(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateDesign.isPending}
              >
                {generateDesign.isPending ? (
                  'Starting...'
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" />
                    Generate Design
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generating Design</DialogTitle>
              <DialogDescription>
                AI is creating your design. This may take a few minutes.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              {jobId && (
                <JobProgress
                  jobId={jobId}
                  onComplete={handleJobComplete}
                  onFailed={() => {
                    toast({
                      title: 'Generation failed',
                      description: 'Please try again with different parameters.',
                    });
                  }}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
