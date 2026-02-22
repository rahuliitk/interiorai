import { Card, CardContent } from '@openlintel/ui';
import { ShoppingCart } from 'lucide-react';

export default function BOMPage() {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-lg font-semibold">Bill of Materials</h2>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Coming in Feature 7. Auto-generate categorized material lists with quantities and costs.
        </p>
      </CardContent>
    </Card>
  );
}
