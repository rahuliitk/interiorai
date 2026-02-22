import { Card, CardContent } from '@openlintel/ui';
import { FileText } from 'lucide-react';

export default function DrawingsPage() {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-lg font-semibold">Auto-Generated Drawings</h2>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Coming in Feature 6. Generate multi-page PDF drawings with floor plans and wall elevations.
        </p>
      </CardContent>
    </Card>
  );
}
