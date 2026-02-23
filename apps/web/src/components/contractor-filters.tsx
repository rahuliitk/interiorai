'use client';

import { useState } from 'react';
import {
  Input,
  Label,
  Button,
  Badge,
} from '@openlintel/ui';
import { Search, X, MapPin, Filter } from 'lucide-react';

interface ContractorFiltersProps {
  onSearchChange: (search: string) => void;
  onCityChange: (city: string) => void;
  onSpecializationChange: (specializations: string[]) => void;
  search: string;
  city: string;
  selectedSpecializations: string[];
}

const SPECIALIZATIONS = [
  'General Contractor',
  'Interior Designer',
  'Architect',
  'Electrician',
  'Plumber',
  'Carpenter',
  'Painter',
  'HVAC',
  'Flooring',
  'False Ceiling',
  'Kitchen Specialist',
  'Bathroom Specialist',
  'Landscaping',
  'Smart Home',
];

const CITIES = [
  'Mumbai',
  'Delhi',
  'Bangalore',
  'Chennai',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'New York',
  'London',
];

export function ContractorFilters({
  onSearchChange,
  onCityChange,
  onSpecializationChange,
  search,
  city,
  selectedSpecializations,
}: ContractorFiltersProps) {
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  const toggleSpecialization = (spec: string) => {
    const updated = selectedSpecializations.includes(spec)
      ? selectedSpecializations.filter((s) => s !== spec)
      : [...selectedSpecializations, spec];
    onSpecializationChange(updated);
  };

  const visibleSpecs = showAllSpecs ? SPECIALIZATIONS : SPECIALIZATIONS.slice(0, 8);
  const hasFilters = search || city || selectedSpecializations.length > 0;

  const clearAll = () => {
    onSearchChange('');
    onCityChange('');
    onSpecializationChange([]);
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
            <X className="mr-1 h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="space-y-2">
        <Label className="text-xs">Search</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contractors..."
            className="pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* City */}
      <div className="space-y-2">
        <Label className="text-xs">City</Label>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onCityChange('')}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              !city ? 'bg-primary text-white' : 'border bg-white hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onCityChange(c === city ? '' : c)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                city === c ? 'bg-primary text-white' : 'border bg-white hover:bg-gray-50'
              }`}
            >
              <MapPin className="mr-0.5 inline h-2.5 w-2.5" />
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Specializations */}
      <div className="space-y-2">
        <Label className="text-xs">Specialization</Label>
        <div className="space-y-1">
          {visibleSpecs.map((spec) => (
            <label
              key={spec}
              className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedSpecializations.includes(spec)}
                onChange={() => toggleSpecialization(spec)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-xs">{spec}</span>
            </label>
          ))}
        </div>
        {SPECIALIZATIONS.length > 8 && (
          <button
            onClick={() => setShowAllSpecs(!showAllSpecs)}
            className="text-xs text-primary hover:underline"
          >
            {showAllSpecs ? 'Show less' : `Show all (${SPECIALIZATIONS.length})`}
          </button>
        )}
      </div>

      {/* Active filter tags */}
      {selectedSpecializations.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t pt-3">
          {selectedSpecializations.map((spec) => (
            <Badge key={spec} variant="secondary" className="gap-1 text-[10px]">
              {spec}
              <button onClick={() => toggleSpecialization(spec)}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
