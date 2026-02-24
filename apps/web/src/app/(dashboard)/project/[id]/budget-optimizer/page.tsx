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
  Input,
  Label,
  toast,
} from '@openlintel/ui';
import {
  PiggyBank,
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  TrendingDown,
} from 'lucide-react';

const CONSTRAINT_OPTIONS = [
  { id: 'keep-premium', label: 'Keep premium brands' },
  { id: 'prioritize-durability', label: 'Prioritize durability' },
  { id: 'local-materials', label: 'Local materials only' },
  { id: 'eco-friendly', label: 'Eco-friendly' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const currencyFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export default function BudgetOptimizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  // --- state ---
  const [targetBudget, setTargetBudget] = useState<number>(0);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [whatIfQuestion, setWhatIfQuestion] = useState('');
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<{
    answer: string;
    estimatedImpact: number;
  } | null>(null);

  // --- queries ---
  const { data: scenarios = [], isLoading } =
    trpc.budgetOptimization.listScenarios.useQuery({ projectId });

  // --- mutations ---
  const generateScenario = trpc.budgetOptimization.generateScenario.useMutation(
    {
      onSuccess: () => {
        utils.budgetOptimization.listScenarios.invalidate({ projectId });
        toast({ title: 'Scenario generated successfully' });
      },
      onError: (err) => {
        toast({
          title: 'Failed to generate scenario',
          description: err.message,
        });
      },
    },
  );

  const acceptScenario = trpc.budgetOptimization.acceptScenario.useMutation({
    onSuccess: () => {
      utils.budgetOptimization.listScenarios.invalidate({ projectId });
      toast({ title: 'Scenario accepted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to accept scenario', description: err.message });
    },
  });

  const whatIf = trpc.budgetOptimization.whatIf.useMutation({
    onSuccess: (data) => {
      setWhatIfResult(data);
    },
    onError: (err) => {
      toast({
        title: 'What-if analysis failed',
        description: err.message,
      });
    },
  });

  // --- handlers ---
  const toggleConstraint = (constraint: string) => {
    setConstraints((prev) =>
      prev.includes(constraint)
        ? prev.filter((c) => c !== constraint)
        : [...prev, constraint],
    );
  };

  const handleGenerate = () => {
    generateScenario.mutate({
      projectId,
      targetBudget: targetBudget > 0 ? targetBudget : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
    });
  };

  const handleAccept = (id: string) => {
    acceptScenario.mutate({ id });
  };

  const handleWhatIf = () => {
    if (!whatIfQuestion.trim()) return;
    setWhatIfResult(null);
    whatIf.mutate({ projectId, question: whatIfQuestion.trim() });
  };

  // --- loading state ---
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Budget Optimizer
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Use AI to find cost-saving material substitutions while maintaining
          design quality and aesthetics.
        </p>
      </div>

      {/* Controls section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Optimization Controls</CardTitle>
          <CardDescription>
            Set a target budget and constraints, then generate an AI-powered
            optimization scenario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Target budget */}
            <div className="space-y-2">
              <Label htmlFor="target-budget">Target Budget (INR)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="target-budget"
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="e.g. 500000"
                  value={targetBudget || ''}
                  onChange={(e) =>
                    setTargetBudget(Number(e.target.value) || 0)
                  }
                  className="max-w-xs"
                />
                {targetBudget > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Target: {currencyFmt.format(targetBudget)}
                  </span>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={5000000}
                step={50000}
                value={targetBudget}
                onChange={(e) => setTargetBudget(Number(e.target.value))}
                className="w-full max-w-xs accent-primary"
              />
            </div>

            {/* Constraint toggles */}
            <div className="space-y-2">
              <Label>Constraints</Label>
              <div className="flex flex-wrap gap-2">
                {CONSTRAINT_OPTIONS.map((opt) => {
                  const isActive = constraints.includes(opt.label);
                  return (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      onClick={() => toggleConstraint(opt.label)}
                    >
                      {isActive && <Check className="mr-1 h-3 w-3" />}
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={generateScenario.isPending}
            >
              {generateScenario.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <TrendingDown className="mr-2 h-4 w-4" />
                  Generate Scenario
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scenarios list */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Optimization Scenarios
        </h2>

        {scenarios.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <PiggyBank className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No Scenarios Yet</h3>
            <p className="text-sm text-muted-foreground">
              Configure your target budget and constraints above, then generate
              your first AI optimization scenario.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {scenarios.map((scenario: any) => {
              const isExpanded = selectedScenario === scenario.id;
              const substitutions = (scenario.substitutions as any[]) || [];
              const savingsPercent =
                typeof scenario.savingsPercent === 'number'
                  ? scenario.savingsPercent
                  : 0;
              const savingsAmount =
                typeof scenario.savingsAmount === 'number'
                  ? scenario.savingsAmount
                  : 0;

              return (
                <Card key={scenario.id}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() =>
                      setSelectedScenario(isExpanded ? null : scenario.id)
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">
                          {scenario.name}
                        </CardTitle>
                        <Badge
                          className={`text-[10px] ${STATUS_COLORS[scenario.status] || STATUS_COLORS.draft}`}
                        >
                          {scenario.status}
                        </Badge>
                        {savingsAmount > 0 && (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">
                            Save {savingsPercent}%
                          </Badge>
                        )}
                      </div>
                      {scenario.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acceptScenario.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAccept(scenario.id);
                          }}
                        >
                          {acceptScenario.isPending ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          Accept
                        </Button>
                      )}
                    </div>
                    <CardDescription>
                      Original:{' '}
                      {currencyFmt.format(scenario.originalTotalCost ?? 0)}
                      <ArrowRight className="mx-1 inline h-3 w-3" />
                      Optimized:{' '}
                      {currencyFmt.format(scenario.optimizedTotalCost ?? 0)}
                      {savingsAmount > 0 && (
                        <span className="ml-2 font-medium text-green-700">
                          (saving {currencyFmt.format(savingsAmount)})
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>

                  {/* Expandable substitutions table */}
                  {isExpanded && substitutions.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-left">
                              <th className="px-3 py-2 font-medium text-muted-foreground">
                                Original Item
                              </th>
                              <th className="px-3 py-2 font-medium text-muted-foreground" />
                              <th className="px-3 py-2 font-medium text-muted-foreground">
                                Replacement
                              </th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                                Savings
                              </th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">
                                Reason
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {substitutions.map(
                              (sub: any, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-b last:border-0"
                                >
                                  <td className="px-3 py-2">
                                    <div>
                                      <p className="font-medium">
                                        {sub.original}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {currencyFmt.format(
                                          sub.originalCost ?? 0,
                                        )}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-1 py-2">
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <div>
                                      <p className="font-medium">
                                        {sub.replacement}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {currencyFmt.format(
                                          sub.replacementCost ?? 0,
                                        )}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Badge className="bg-green-100 text-green-800 text-xs">
                                      {currencyFmt.format(sub.savings ?? 0)}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px]">
                                    {sub.reason}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}

                  {isExpanded && substitutions.length === 0 && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground italic">
                        No substitutions recorded for this scenario.
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* What-If section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">What-If Analysis</CardTitle>
          </div>
          <CardDescription>
            Ask a question about your project budget and get AI-powered cost
            impact estimates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder='e.g. "What if I switch all flooring to laminate?"'
                value={whatIfQuestion}
                onChange={(e) => setWhatIfQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWhatIf();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleWhatIf}
                disabled={whatIf.isPending || !whatIfQuestion.trim()}
              >
                {whatIf.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Ask'
                )}
              </Button>
            </div>

            {whatIf.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing your question...
              </div>
            )}

            {whatIfResult && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-sm leading-relaxed">{whatIfResult.answer}</p>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Estimated Impact:{' '}
                  </span>
                  <Badge
                    className={
                      whatIfResult.estimatedImpact < 0
                        ? 'bg-green-100 text-green-800'
                        : whatIfResult.estimatedImpact > 0
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }
                  >
                    {whatIfResult.estimatedImpact < 0 ? '' : '+'}
                    {currencyFmt.format(whatIfResult.estimatedImpact)}
                  </Badge>
                </div>
              </div>
            )}

            {!whatIf.isPending && !whatIfResult && (
              <p className="text-xs text-muted-foreground">
                Try asking about material changes, scope adjustments, or vendor
                alternatives to see how they would affect your budget.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
