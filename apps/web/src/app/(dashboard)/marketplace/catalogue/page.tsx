'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Separator,
} from '@openlintel/ui';
import {
  Search, Package, Grid3x3, ChevronRight, ChevronDown,
  ShoppingBag, IndianRupee,
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  category: string;
  categoryId?: string;
  sku?: string;
  status?: string;
  unit?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
  specifications?: Record<string, string>;
  dimensions?: { length_mm?: number; width_mm?: number; height_mm?: number };
  material?: string;
  finish?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  vendorId?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  icon?: string;
  productCount?: number;
  children?: Category[];
}

function CategoryTree({
  categories,
  selectedId,
  onSelect,
  depth = 0,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className={depth > 0 ? 'ml-3' : ''}>
      {categories.map((cat) => {
        const hasChildren = cat.children && cat.children.length > 0;
        const isExpanded = expanded[cat.id];
        const isSelected = selectedId === cat.id;

        return (
          <div key={cat.id}>
            <button
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors ${
                isSelected ? 'bg-primary/10 text-primary font-medium' : ''
              }`}
              onClick={() => {
                onSelect(isSelected ? null : cat.id);
                if (hasChildren) {
                  setExpanded(prev => ({ ...prev, [cat.id]: !prev[cat.id] }));
                }
              }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
              ) : (
                <span className="w-3" />
              )}
              <span className="truncate">{cat.name}</span>
              {cat.productCount != null && cat.productCount > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px] px-1 py-0">
                  {cat.productCount}
                </Badge>
              )}
            </button>
            {hasChildren && isExpanded && (
              <CategoryTree
                categories={cat.children!}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer overflow-hidden hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="aspect-square bg-muted flex items-center justify-center">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-12 w-12 text-muted-foreground/40" />
        )}
      </div>
      <CardContent className="p-3">
        <p className="text-sm font-medium truncate">{product.name}</p>
        {product.brand && (
          <p className="text-xs text-muted-foreground">{product.brand}</p>
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <Badge variant="outline" className="text-[10px]">
            {product.category}
          </Badge>
          {(product.minPrice != null || product.maxPrice != null) && (
            <span className="text-xs font-medium text-green-600">
              {product.minPrice != null && product.maxPrice != null
                ? product.minPrice === product.maxPrice
                  ? `₹${product.minPrice.toLocaleString()}`
                  : `₹${product.minPrice.toLocaleString()} - ₹${product.maxPrice.toLocaleString()}`
                : product.minPrice != null
                  ? `From ₹${product.minPrice.toLocaleString()}`
                  : `Up to ₹${product.maxPrice!.toLocaleString()}`
              }
            </span>
          )}
        </div>
        {product.material && (
          <p className="mt-1 text-[10px] text-muted-foreground truncate">
            {product.material}{product.finish ? ` / ${product.finish}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CataloguePage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: categoryTree = [], isLoading: loadingCategories } =
    trpc.catalogue.getCategoryTree.useQuery();

  const { data: products, isLoading: loadingProducts } = debouncedSearch
    ? trpc.catalogue.searchProducts.useQuery(
        { query: debouncedSearch, limit: 40 },
        { enabled: debouncedSearch.length > 0 },
      )
    : trpc.catalogue.listProducts.useQuery({
        page: 1,
        limit: 40,
        categoryId: selectedCategoryId ?? undefined,
      });

  const productList: Product[] = Array.isArray(products)
    ? products
    : (products as any)?.items ?? (products as any)?.products ?? [];

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Product Catalogue</h1>
        <p className="text-sm text-muted-foreground">
          Browse materials, furniture, and fixtures for your projects.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Category sidebar */}
        <div className="w-56 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCategories ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-6" />)}
                </div>
              ) : categoryTree.length > 0 ? (
                <>
                  <button
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted mb-1 ${
                      selectedCategoryId === null ? 'bg-primary/10 text-primary font-medium' : ''
                    }`}
                    onClick={() => setSelectedCategoryId(null)}
                  >
                    <Grid3x3 className="h-3 w-3" />
                    All Products
                  </button>
                  <Separator className="my-1" />
                  <CategoryTree
                    categories={categoryTree}
                    selectedId={selectedCategoryId}
                    onSelect={setSelectedCategoryId}
                  />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No categories available. Run the seed script to populate the catalogue.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Products grid */}
        <div className="flex-1">
          {/* Search bar */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {loadingProducts ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="aspect-[3/4]" />
              ))}
            </div>
          ) : productList.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {productList.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">
                {debouncedSearch ? 'No Results' : 'No Products'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {debouncedSearch
                  ? `No products match "${debouncedSearch}". Try a different search.`
                  : 'Run the seed script to populate the product catalogue.'}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Product detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProduct.name}</DialogTitle>
                {selectedProduct.brand && (
                  <DialogDescription>by {selectedProduct.brand}</DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-4">
                {/* Image */}
                <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  {selectedProduct.imageUrl ? (
                    <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="h-full w-full object-contain" />
                  ) : (
                    <Package className="h-16 w-16 text-muted-foreground/30" />
                  )}
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Category</p>
                    <p className="text-sm">{selectedProduct.category}</p>
                  </div>
                  {selectedProduct.sku && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">SKU</p>
                      <p className="text-sm font-mono">{selectedProduct.sku}</p>
                    </div>
                  )}
                  {selectedProduct.material && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Material</p>
                      <p className="text-sm">{selectedProduct.material}</p>
                    </div>
                  )}
                  {selectedProduct.finish && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Finish</p>
                      <p className="text-sm">{selectedProduct.finish}</p>
                    </div>
                  )}
                  {selectedProduct.color && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Color</p>
                      <div className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded border" style={{ backgroundColor: selectedProduct.color }} />
                        <span className="text-sm">{selectedProduct.color}</span>
                      </div>
                    </div>
                  )}
                  {selectedProduct.unit && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Unit</p>
                      <p className="text-sm">{selectedProduct.unit}</p>
                    </div>
                  )}
                </div>

                {/* Dimensions */}
                {selectedProduct.dimensions && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Dimensions</p>
                      <div className="flex gap-4 text-sm">
                        {selectedProduct.dimensions.length_mm != null && (
                          <span>L: {selectedProduct.dimensions.length_mm} mm</span>
                        )}
                        {selectedProduct.dimensions.width_mm != null && (
                          <span>W: {selectedProduct.dimensions.width_mm} mm</span>
                        )}
                        {selectedProduct.dimensions.height_mm != null && (
                          <span>H: {selectedProduct.dimensions.height_mm} mm</span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Specifications */}
                {selectedProduct.specifications && Object.keys(selectedProduct.specifications).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Specifications</p>
                      <div className="space-y-1.5">
                        {Object.entries(selectedProduct.specifications).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{key}</span>
                            <span className="font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Price */}
                {(selectedProduct.minPrice != null || selectedProduct.maxPrice != null) && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 text-green-600" />
                      <span className="text-lg font-bold text-green-600">
                        {selectedProduct.minPrice != null && selectedProduct.maxPrice != null
                          ? selectedProduct.minPrice === selectedProduct.maxPrice
                            ? `₹${selectedProduct.minPrice.toLocaleString()}`
                            : `₹${selectedProduct.minPrice.toLocaleString()} - ₹${selectedProduct.maxPrice.toLocaleString()}`
                          : selectedProduct.minPrice != null
                            ? `From ₹${selectedProduct.minPrice.toLocaleString()}`
                            : `Up to ₹${selectedProduct.maxPrice!.toLocaleString()}`
                        }
                      </span>
                      {selectedProduct.unit && (
                        <span className="text-sm text-muted-foreground">per {selectedProduct.unit}</span>
                      )}
                    </div>
                  </>
                )}

                {/* Description */}
                {selectedProduct.description && (
                  <>
                    <Separator />
                    <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
                  </>
                )}

                {/* Tags */}
                {selectedProduct.tags && selectedProduct.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProduct.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
