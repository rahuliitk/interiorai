'use client';

import { use, useState, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Skeleton,
  Input,
  Label,
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  Palette,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Link2,
  Star,
  DollarSign,
  Lightbulb,
  LayoutGrid,
  Sun,
  Moon,
  Minus,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'quiz', label: 'Style Quiz', icon: Sparkles },
  { id: 'budget', label: 'Budget Tier', icon: DollarSign },
  { id: 'colors', label: 'Color Preferences', icon: Palette },
  { id: 'moodboard', label: 'Mood Board', icon: ImageIcon },
  { id: 'results', label: 'Results', icon: Star },
] as const;

interface QuizQuestion {
  id: string;
  question: string;
  description: string;
  options: { value: string; label: string; description: string }[];
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'overall_style',
    question: 'What overall style resonates with you?',
    description: 'Choose the aesthetic that best represents your ideal living space.',
    options: [
      { value: 'geometric_bold_color_mixed_materials', label: 'Modern', description: 'Clean geometry, bold accents, mixed materials' },
      { value: 'ornate_warm_wood_classic_patterns', label: 'Traditional', description: 'Ornate details, warm wood, classic patterns' },
      { value: 'clean_lines_neutral_less_furniture', label: 'Minimalist', description: 'Clean lines, neutral palette, open space' },
      { value: 'exposed_brick_metal_raw_finishes', label: 'Industrial', description: 'Exposed brick, metal accents, raw finishes' },
    ],
  },
  {
    id: 'color_warmth',
    question: 'What color temperature do you prefer?',
    description: 'This will guide the overall color direction of your design.',
    options: [
      { value: 'warm_wood_colorful', label: 'Warm Tones', description: 'Earthy reds, oranges, warm yellows, and natural wood' },
      { value: 'white_light_wood_neutral', label: 'Cool Tones', description: 'Blues, greens, grays, and crisp whites' },
      { value: 'neutral_clean_lines', label: 'Neutral', description: 'Beiges, taupes, soft grays, and off-whites' },
    ],
  },
  {
    id: 'material_preference',
    question: 'Which material speaks to you most?',
    description: 'The primary material will set the tone for furniture and finishes.',
    options: [
      { value: 'warm_wood_light_wood', label: 'Wood', description: 'Natural warmth, grain patterns, organic feel' },
      { value: 'metal_exposed_brick_raw_finishes', label: 'Metal & Stone', description: 'Sleek metal, stone surfaces, industrial edge' },
      { value: 'mixed_materials_eclectic', label: 'Mixed Materials', description: 'Eclectic blend of wood, metal, glass, and fabric' },
    ],
  },
  {
    id: 'furniture_density',
    question: 'How do you like your space furnished?',
    description: 'This determines the balance between openness and coziness.',
    options: [
      { value: 'less_furniture_clean_lines', label: 'Spacious & Open', description: 'Fewer key pieces, lots of breathing room' },
      { value: 'cozy_textiles_plants_colorful', label: 'Cozy & Layered', description: 'Plush textiles, layered accessories, welcoming' },
      { value: 'neutral_mixed_materials', label: 'Balanced', description: 'Curated selection, neither sparse nor cluttered' },
    ],
  },
  {
    id: 'lighting_style',
    question: 'What lighting mood do you prefer?',
    description: 'Lighting dramatically affects the atmosphere of your space.',
    options: [
      { value: 'white_clean_lines_light_wood', label: 'Bright & Airy', description: 'Maximum natural light, sheer curtains, light fixtures' },
      { value: 'warm_wood_cozy_textiles', label: 'Ambient & Warm', description: 'Soft pools of light, table lamps, warm bulbs' },
      { value: 'bold_color_geometric_exposed_brick', label: 'Dramatic & Moody', description: 'Statement pendants, spotlights, contrast' },
    ],
  },
  {
    id: 'pattern_preference',
    question: 'What pattern style do you gravitate toward?',
    description: 'Patterns add personality and visual interest to your design.',
    options: [
      { value: 'neutral_clean_lines_less_furniture', label: 'Solid & Minimal', description: 'Solid colors, subtle textures, no bold patterns' },
      { value: 'geometric_bold_color', label: 'Geometric', description: 'Stripes, chevrons, hexagons, structured repeats' },
      { value: 'plants_eclectic_colorful_classic_patterns', label: 'Organic & Botanical', description: 'Florals, leaves, flowing curves, nature-inspired' },
    ],
  },
];

const BUDGET_TIERS = [
  {
    value: 'economy' as const,
    label: 'Economy',
    range: '$5,000 - $15,000',
    description: 'Smart choices with budget-friendly materials. Focuses on key impact areas.',
    icon: DollarSign,
    color: 'border-green-300 bg-green-50',
    activeColor: 'border-green-500 bg-green-100 ring-2 ring-green-500',
  },
  {
    value: 'mid_range' as const,
    label: 'Mid-Range',
    range: '$15,000 - $50,000',
    description: 'Quality materials with room for customization. Balanced investment.',
    icon: DollarSign,
    color: 'border-blue-300 bg-blue-50',
    activeColor: 'border-blue-500 bg-blue-100 ring-2 ring-blue-500',
  },
  {
    value: 'premium' as const,
    label: 'Premium',
    range: '$50,000 - $150,000',
    description: 'High-end finishes, designer furniture, and premium appliances.',
    icon: Star,
    color: 'border-purple-300 bg-purple-50',
    activeColor: 'border-purple-500 bg-purple-100 ring-2 ring-purple-500',
  },
  {
    value: 'luxury' as const,
    label: 'Luxury',
    range: '$150,000+',
    description: 'Bespoke everything. Custom millwork, luxury brands, full concierge.',
    icon: Sparkles,
    color: 'border-amber-300 bg-amber-50',
    activeColor: 'border-amber-500 bg-amber-100 ring-2 ring-amber-500',
  },
];

const COLOR_PALETTES = {
  warm: [
    { name: 'Terracotta Sunset', colors: ['#C75B39', '#E8915C', '#F2C094', '#F5E1C8', '#FAF0E4'] },
    { name: 'Golden Hour', colors: ['#B8860B', '#DAA520', '#F0D58C', '#FFF8DC', '#FFFEF5'] },
    { name: 'Autumn Harvest', colors: ['#8B4513', '#CD853F', '#DEB887', '#F5DEB3', '#FFF8E7'] },
    { name: 'Rose Garden', colors: ['#8B2252', '#CD5C5C', '#E8A0A0', '#F5C4C4', '#FFF0F0'] },
  ],
  cool: [
    { name: 'Ocean Breeze', colors: ['#1B4F72', '#2E86C1', '#85C1E9', '#AED6F1', '#D6EAF8'] },
    { name: 'Forest Mist', colors: ['#1E5631', '#3E8E5E', '#7BC89C', '#A8E6CE', '#D5F5E3'] },
    { name: 'Arctic Frost', colors: ['#4A6FA5', '#7B9EC8', '#B0C9E8', '#D4E3F5', '#EBF2FA'] },
    { name: 'Lavender Fields', colors: ['#6C3483', '#9B59B6', '#C39BD3', '#D7BDE2', '#EBDEF0'] },
  ],
};

// ── Main Component ─────────────────────────────────────────────────────────

export default function StyleQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);

  // ── State ────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [budgetTier, setBudgetTier] = useState<'economy' | 'mid_range' | 'premium' | 'luxury' | null>(null);
  const [warmColors, setWarmColors] = useState(true);
  const [selectedPalette, setSelectedPalette] = useState<string[] | null>(null);
  const [selectedPaletteName, setSelectedPaletteName] = useState<string | null>(null);
  const [inspirationUrl, setInspirationUrl] = useState('');
  const [inspirationUrls, setInspirationUrls] = useState<string[]>([]);
  const [moodBoardNotes, setMoodBoardNotes] = useState('');

  // ── tRPC Queries & Mutations ─────────────────────────────
  const utils = trpc.useUtils();

  const { data: existing, isLoading } = trpc.styleQuiz.get.useQuery(
    { projectId },
    {
      onSuccess: (data: any) => {
        if (data) {
          if (data.quizResponses && Array.isArray(data.quizResponses)) {
            const answers: Record<string, string> = {};
            (data.quizResponses as { questionId: string; selectedOption: string }[]).forEach(
              (r) => { answers[r.questionId] = r.selectedOption; },
            );
            setQuizAnswers(answers);
          }
          if (data.budgetTier) setBudgetTier(data.budgetTier as any);
          if (data.colorPreferences) {
            const cp = data.colorPreferences as { palette?: string[]; warm?: boolean };
            if (cp.palette) setSelectedPalette(cp.palette);
            if (typeof cp.warm === 'boolean') setWarmColors(cp.warm);
          }
          if (data.inspirationUrls && Array.isArray(data.inspirationUrls)) {
            setInspirationUrls(data.inspirationUrls as string[]);
          }
        }
      },
    },
  );

  const saveQuizMutation = trpc.styleQuiz.saveQuizResponses.useMutation({
    onSuccess: () => {
      utils.styleQuiz.invalidate();
      toast({ title: 'Quiz responses saved', description: 'Your style preferences have been recorded.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error saving quiz', description: err.message, variant: 'destructive' });
    },
  });

  const saveColorsMutation = trpc.styleQuiz.saveColorPreferences.useMutation({
    onSuccess: () => {
      utils.styleQuiz.invalidate();
      toast({ title: 'Color preferences saved', description: 'Your palette has been recorded.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error saving colors', description: err.message, variant: 'destructive' });
    },
  });

  const saveInspirationMutation = trpc.styleQuiz.saveInspirationUrls.useMutation({
    onSuccess: () => {
      utils.styleQuiz.invalidate();
      toast({ title: 'Inspiration saved', description: 'Your mood board links have been recorded.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error saving inspiration', description: err.message, variant: 'destructive' });
    },
  });

  const saveMoodBoardMutation = trpc.styleQuiz.saveMoodBoard.useMutation({
    onSuccess: () => {
      utils.styleQuiz.invalidate();
      toast({ title: 'Mood board saved', description: 'Your mood board items have been recorded.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error saving mood board', description: err.message, variant: 'destructive' });
    },
  });

  // ── Derived Data ─────────────────────────────────────────
  const quizResponses = useMemo(() => {
    return Object.entries(quizAnswers).map(([questionId, selectedOption]) => ({
      questionId,
      selectedOption,
    }));
  }, [quizAnswers]);

  const detectedStyles = useMemo(() => {
    const styleScores: Record<string, number> = {};
    const styleMap: Record<string, string[]> = {
      minimal: ['clean_lines', 'neutral', 'less_furniture'],
      modern: ['geometric', 'bold_color', 'mixed_materials'],
      traditional: ['ornate', 'warm_wood', 'classic_patterns'],
      industrial: ['exposed_brick', 'metal', 'raw_finishes'],
      scandinavian: ['light_wood', 'white', 'cozy_textiles'],
      bohemian: ['colorful', 'eclectic', 'plants'],
    };
    quizResponses.forEach((r) => {
      Object.entries(styleMap).forEach(([style, keywords]) => {
        if (keywords.some((kw) => r.selectedOption.toLowerCase().includes(kw))) {
          styleScores[style] = (styleScores[style] || 0) + 1;
        }
      });
    });
    return Object.entries(styleScores)
      .map(([style, score]) => ({ style, score }))
      .sort((a, b) => b.score - a.score);
  }, [quizResponses]);

  const allQuestionsAnswered = QUIZ_QUESTIONS.every((q) => quizAnswers[q.id]);

  // ── Handlers ─────────────────────────────────────────────
  const handleQuizAnswer = useCallback((questionId: string, value: string) => {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleAddInspirationUrl = useCallback(() => {
    const trimmed = inspirationUrl.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL.', variant: 'destructive' });
      return;
    }
    if (inspirationUrls.includes(trimmed)) {
      toast({ title: 'Duplicate URL', description: 'This URL is already in your list.', variant: 'destructive' });
      return;
    }
    setInspirationUrls((prev) => [...prev, trimmed]);
    setInspirationUrl('');
  }, [inspirationUrl, inspirationUrls]);

  const handleRemoveInspirationUrl = useCallback((url: string) => {
    setInspirationUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep === 0 && allQuestionsAnswered) {
      saveQuizMutation.mutate({
        projectId,
        quizResponses,
        budgetTier: budgetTier ?? undefined,
      });
    }
    if (currentStep === 1 && budgetTier) {
      saveQuizMutation.mutate({
        projectId,
        quizResponses,
        budgetTier,
      });
    }
    if (currentStep === 2 && selectedPalette) {
      saveColorsMutation.mutate({
        projectId,
        colorPreferences: { palette: selectedPalette, warm: warmColors },
      });
    }
    if (currentStep === 3) {
      if (inspirationUrls.length > 0) {
        saveInspirationMutation.mutate({ projectId, inspirationUrls });
      }
      if (moodBoardNotes.trim()) {
        saveMoodBoardMutation.mutate({
          projectId,
          moodBoardItems: [{ imageUrl: '', caption: moodBoardNotes, source: 'notes', category: 'notes' }],
        });
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, [
    currentStep, allQuestionsAnswered, budgetTier, selectedPalette, warmColors,
    inspirationUrls, moodBoardNotes, projectId, quizResponses,
    saveQuizMutation, saveColorsMutation, saveInspirationMutation, saveMoodBoardMutation,
  ]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleSaveAndComplete = useCallback(() => {
    saveQuizMutation.mutate({
      projectId,
      quizResponses,
      budgetTier: budgetTier ?? undefined,
    });
    if (selectedPalette) {
      saveColorsMutation.mutate({
        projectId,
        colorPreferences: { palette: selectedPalette, warm: warmColors },
      });
    }
    if (inspirationUrls.length > 0) {
      saveInspirationMutation.mutate({ projectId, inspirationUrls });
    }
    toast({ title: 'Style profile complete!', description: 'All your preferences have been saved.' });
  }, [
    projectId, quizResponses, budgetTier, selectedPalette, warmColors,
    inspirationUrls, saveQuizMutation, saveColorsMutation, saveInspirationMutation,
  ]);

  // ── Loading State ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  // ── Step Indicator ───────────────────────────────────────
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = index === currentStep;
        const isComplete = index < currentStep;
        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div
                className={`h-0.5 w-8 mx-1 transition-colors ${
                  isComplete ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
            <button
              onClick={() => setCurrentStep(index)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isComplete
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isComplete ? (
                <Check className="h-4 w-4" />
              ) : (
                <StepIcon className="h-4 w-4" />
              )}
              <span className="hidden md:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Style Quiz ───────────────────────────────────
  const renderQuizStep = () => (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Discover Your Style</h2>
        <p className="text-muted-foreground mt-2">
          Answer these questions to help us understand your design preferences.
        </p>
      </div>

      {QUIZ_QUESTIONS.map((question, qIndex) => (
        <Card key={question.id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {qIndex + 1}/{QUIZ_QUESTIONS.length}
              </Badge>
              <CardTitle className="text-lg">{question.question}</CardTitle>
            </div>
            <CardDescription>{question.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {question.options.map((option) => {
                const isSelected = quizAnswers[question.id] === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleQuizAnswer(question.id, option.value)}
                    className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-semibold text-sm">{option.label}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {!allQuestionsAnswered && (
        <p className="text-center text-sm text-muted-foreground">
          Please answer all {QUIZ_QUESTIONS.length} questions to continue.
        </p>
      )}
    </div>
  );

  // ── Step 2: Budget Tier ──────────────────────────────────
  const renderBudgetStep = () => (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Select Your Budget</h2>
        <p className="text-muted-foreground mt-2">
          Choose a budget tier to help us recommend appropriate materials and products.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {BUDGET_TIERS.map((tier) => {
          const TierIcon = tier.icon;
          const isSelected = budgetTier === tier.value;
          return (
            <button
              key={tier.value}
              onClick={() => setBudgetTier(tier.value)}
              className={`p-6 rounded-xl border-2 text-left transition-all hover:shadow-lg ${
                isSelected ? tier.activeColor : tier.color
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/80' : 'bg-white/60'}`}>
                  <TierIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{tier.label}</h3>
                  <p className="text-sm font-medium opacity-75">{tier.range}</p>
                </div>
                {isSelected && (
                  <Check className="h-5 w-5 ml-auto text-primary" />
                )}
              </div>
              <p className="text-sm opacity-80 leading-relaxed">{tier.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Step 3: Color Preferences ────────────────────────────
  const renderColorStep = () => {
    const palettes = warmColors ? COLOR_PALETTES.warm : COLOR_PALETTES.cool;

    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Color Preferences</h2>
          <p className="text-muted-foreground mt-2">
            Choose a color temperature and select a palette that inspires you.
          </p>
        </div>

        {/* Warm / Cool Toggle */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => { setWarmColors(true); setSelectedPalette(null); setSelectedPaletteName(null); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all ${
              warmColors
                ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-400'
                : 'border-muted text-muted-foreground hover:border-orange-200'
            }`}
          >
            <Sun className="h-5 w-5" />
            <span className="font-medium">Warm Tones</span>
          </button>
          <button
            onClick={() => { setWarmColors(false); setSelectedPalette(null); setSelectedPaletteName(null); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all ${
              !warmColors
                ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-400'
                : 'border-muted text-muted-foreground hover:border-blue-200'
            }`}
          >
            <Moon className="h-5 w-5" />
            <span className="font-medium">Cool Tones</span>
          </button>
        </div>

        {/* Palette Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {palettes.map((palette) => {
            const isSelected = selectedPaletteName === palette.name;
            return (
              <button
                key={palette.name}
                onClick={() => {
                  setSelectedPalette(palette.colors);
                  setSelectedPaletteName(palette.name);
                }}
                className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-lg ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30 shadow-md'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{palette.name}</h3>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex gap-1.5 h-16 rounded-lg overflow-hidden">
                  {palette.colors.map((color, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-md transition-transform hover:scale-105"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                  {palette.colors.map((color, i) => (
                    <span key={i} className="flex-1 text-center text-[10px] text-muted-foreground font-mono">
                      {color}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {selectedPalette && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedPaletteName}</span>
            </p>
          </div>
        )}
      </div>
    );
  };

  // ── Step 4: Mood Board ───────────────────────────────────
  const renderMoodBoardStep = () => (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Mood Board & Inspiration</h2>
        <p className="text-muted-foreground mt-2">
          Add links to images, Pinterest boards, or websites that inspire your design vision.
        </p>
      </div>

      {/* Add URL Input */}
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Add Inspiration Links
          </CardTitle>
          <CardDescription>
            Paste URLs to Pinterest pins, Houzz photos, Instagram posts, or any design inspiration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={inspirationUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInspirationUrl(e.target.value)}
              placeholder="https://www.pinterest.com/pin/..."
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddInspirationUrl();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleAddInspirationUrl} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* URL List */}
          {inspirationUrls.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Added Links ({inspirationUrls.length})
              </Label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {inspirationUrls.map((url, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30 group"
                  >
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate flex-1"
                    >
                      {url}
                    </a>
                    <button
                      onClick={() => handleRemoveInspirationUrl(url)}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No inspiration links added yet.</p>
              <p className="text-xs mt-1">Paste a URL above and click Add to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Design Notes
          </CardTitle>
          <CardDescription>
            Describe your vision, must-haves, or anything else the designer should know.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={moodBoardNotes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMoodBoardNotes(e.target.value)}
            placeholder="I love the feel of natural light streaming through sheer curtains, with lots of indoor plants and natural wood textures. I want the living room to feel like a warm, inviting retreat..."
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {moodBoardNotes.length} characters
          </p>
        </CardContent>
      </Card>
    </div>
  );

  // ── Step 5: Results Summary ──────────────────────────────
  const renderResultsStep = () => {
    const isSaving =
      saveQuizMutation.isLoading ||
      saveColorsMutation.isLoading ||
      saveInspirationMutation.isLoading ||
      saveMoodBoardMutation.isLoading;

    const maxScore = detectedStyles.length > 0 ? detectedStyles[0].score : 1;

    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Your Style Profile</h2>
          <p className="text-muted-foreground mt-2">
            Here is a summary of your design preferences. Save to finalize your profile.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Detected Styles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Detected Styles
              </CardTitle>
              <CardDescription>
                Based on your quiz answers, these styles match your preferences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detectedStyles.length > 0 ? (
                <div className="space-y-3">
                  {detectedStyles.map((ds, index) => (
                    <div key={ds.style} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">
                          {index === 0 && <Star className="h-3 w-3 inline mr-1 text-amber-500" />}
                          {ds.style}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ds.score} point{ds.score !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(ds.score / maxScore) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Complete the quiz to see your style matches.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Budget Tier */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Budget Tier
              </CardTitle>
            </CardHeader>
            <CardContent>
              {budgetTier ? (
                <div className="space-y-2">
                  {(() => {
                    const tier = BUDGET_TIERS.find((t) => t.value === budgetTier);
                    if (!tier) return null;
                    const TierIcon = tier.icon;
                    return (
                      <div className={`p-4 rounded-lg border-2 ${tier.activeColor}`}>
                        <div className="flex items-center gap-2">
                          <TierIcon className="h-5 w-5" />
                          <div>
                            <p className="font-bold">{tier.label}</p>
                            <p className="text-sm opacity-75">{tier.range}</p>
                          </div>
                        </div>
                        <p className="text-sm mt-2 opacity-80">{tier.description}</p>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No budget tier selected.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Color Palette */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Color Palette
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedPalette ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    {warmColors ? (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        <Sun className="h-3 w-3 mr-1" /> Warm
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        <Moon className="h-3 w-3 mr-1" /> Cool
                      </Badge>
                    )}
                    {selectedPaletteName && (
                      <span className="text-sm font-medium">{selectedPaletteName}</span>
                    )}
                  </div>
                  <div className="flex gap-2 h-20 rounded-lg overflow-hidden">
                    {selectedPalette.map((color, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-md"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {selectedPalette.map((color, i) => (
                      <span key={i} className="flex-1 text-center text-xs font-mono text-muted-foreground">
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No color palette selected.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Inspiration Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Inspiration ({inspirationUrls.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inspirationUrls.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {inspirationUrls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate"
                      >
                        {url}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No inspiration links added.
                </p>
              )}
              {moodBoardNotes && (
                <div className="mt-4 p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Design Notes:</p>
                  <p className="text-sm">{moodBoardNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={handleSaveAndComplete}
            size="lg"
            disabled={isSaving}
            className="px-8"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save & Complete
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  // ── Render Current Step ──────────────────────────────────
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderQuizStep();
      case 1:
        return renderBudgetStep();
      case 2:
        return renderColorStep();
      case 3:
        return renderMoodBoardStep();
      case 4:
        return renderResultsStep();
      default:
        return null;
    }
  };

  // ── Can Proceed Logic ────────────────────────────────────
  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return allQuestionsAnswered;
      case 1:
        return budgetTier !== null;
      case 2:
        return selectedPalette !== null;
      case 3:
        return true; // Mood board is optional
      case 4:
        return false; // Last step
      default:
        return false;
    }
  };

  // ── Main Layout ──────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutGrid className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Style Quiz & Mood Board</h1>
            <p className="text-muted-foreground">
              Discover your design style and build your inspiration collection.
            </p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content */}
      <div className="min-h-[400px]">
        {renderCurrentStep()}
      </div>

      {/* Navigation */}
      {currentStep < STEPS.length - 1 && (
        <div className="flex items-center justify-between mt-10 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {currentStep === STEPS.length - 1 && (
        <div className="flex items-center justify-between mt-10 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Mood Board
          </Button>

          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </div>

          <div />
        </div>
      )}
    </div>
  );
}
