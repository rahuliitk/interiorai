'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Skeleton,
} from '@openlintel/ui';
import { Store, ChevronLeft, ChevronRight } from 'lucide-react';
import { ContractorCard } from '@/components/contractor-card';
import { ContractorFilters } from '@/components/contractor-filters';

const PAGE_SIZE = 12;

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  // Debounced search for API call
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
    // Simple debounce using timeout
    clearTimeout((globalThis as Record<string, unknown>).__searchTimeout as number);
    (globalThis as Record<string, unknown>).__searchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: contractors = [], isLoading } = trpc.contractor.list.useQuery({
    search: debouncedSearch || undefined,
    city: city || undefined,
    specialization: specializations[0] || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Filter by multiple specializations client-side (API supports one)
  const filteredContractors = useMemo(() => {
    if (specializations.length <= 1) return contractors;
    return contractors.filter((c: any) => {
      const specs = (c.specializations as string[] | null) || [];
      return specializations.some((s) => specs.includes(s));
    });
  }, [contractors, specializations]);

  const hasMore = contractors.length === PAGE_SIZE;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Find and hire contractors for your interior design projects
        </p>
      </div>

      <div className="flex gap-6">
        {/* Filters sidebar */}
        <div className="w-64 shrink-0">
          <ContractorFilters
            search={search}
            city={city}
            selectedSpecializations={specializations}
            onSearchChange={handleSearchChange}
            onCityChange={(c) => {
              setCity(c);
              setPage(0);
            }}
            onSpecializationChange={(s) => {
              setSpecializations(s);
              setPage(0);
            }}
          />
        </div>

        {/* Results */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredContractors.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <Store className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Contractors Found</h2>
              <p className="text-sm text-muted-foreground">
                {search || city || specializations.length > 0
                  ? 'Try adjusting your filters to find more contractors.'
                  : 'No contractors are listed in the marketplace yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground">
                {filteredContractors.length} contractor{filteredContractors.length !== 1 ? 's' : ''} found
                {page > 0 && ` (page ${page + 1})`}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredContractors.map((contractor: any) => (
                  <ContractorCard
                    key={contractor.id}
                    id={contractor.id}
                    name={contractor.name}
                    company={contractor.companyName}
                    city={contractor.city}
                    specializations={contractor.specializations as string[] | null}
                    rating={contractor.rating ? Number(contractor.rating) : null}
                    totalReviews={contractor.totalReviews}
                    profileImageUrl={contractor.profileImageUrl}
                    verified={contractor.verified}
                  />
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
