import { Card, CardContent } from '@openlintel/ui';
import { Palette } from 'lucide-react';

export default function DesignsPage() {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <Palette className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-lg font-semibold">AI Design Generation</h2>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Coming in Feature 4. Select room + style + budget to generate AI design variants.
        </p>
      </CardContent>
    </Card>
  );
}
