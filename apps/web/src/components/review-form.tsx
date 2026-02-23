'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Textarea,
  DialogFooter,
} from '@openlintel/ui';
import { Star, Send } from 'lucide-react';

interface ReviewFormProps {
  onSubmit: (data: { rating: number; title: string; review: string }) => void;
  isPending?: boolean;
  onCancel?: () => void;
}

export function ReviewForm({ onSubmit, isPending, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');

  const displayRating = hoverRating || rating;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;
    onSubmit({
      rating,
      title: title.trim(),
      review: review.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Star rating */}
      <div className="space-y-2">
        <Label>Rating</Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5 focus:outline-none"
            >
              <Star
                className={`h-7 w-7 transition-colors ${
                  star <= displayRating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-300 hover:text-amber-200'
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {displayRating > 0
              ? ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][displayRating]
              : 'Select rating'}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input
          id="review-title"
          placeholder="Summarize your experience"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Review text */}
      <div className="space-y-2">
        <Label htmlFor="review-text">Review (optional)</Label>
        <Textarea
          id="review-text"
          placeholder="Share details about your experience..."
          rows={4}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
      </div>

      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || rating === 0}>
          {isPending ? (
            'Submitting...'
          ) : (
            <>
              <Send className="mr-1 h-3 w-3" />
              Submit Review
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
