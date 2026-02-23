import { z } from 'zod';
import { router, protectedProcedure } from '../init';

const CATALOGUE_SERVICE_URL = process.env.CATALOGUE_SERVICE_URL || 'http://localhost:8006';

async function catalogueFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${CATALOGUE_SERVICE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Catalogue service error: ${res.status} ${text}`);
  }
  return res.json();
}

export const catalogueRouter = router({
  listProducts: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      categoryId: z.string().optional(),
      vendorId: z.string().optional(),
      sortBy: z.string().default('name'),
    }))
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      params.set('page', String(input.page));
      params.set('limit', String(input.limit));
      if (input.categoryId) params.set('category_id', input.categoryId);
      if (input.vendorId) params.set('vendor_id', input.vendorId);
      params.set('sort_by', input.sortBy);
      return catalogueFetch(`/api/v1/catalogue/products?${params}`);
    }),

  searchProducts: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const params = new URLSearchParams({ q: input.query, limit: String(input.limit) });
      return catalogueFetch(`/api/v1/catalogue/products/search?${params}`);
    }),

  getProduct: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return catalogueFetch(`/api/v1/catalogue/products/${input.id}`);
    }),

  listCategories: protectedProcedure
    .query(async () => {
      return catalogueFetch('/api/v1/catalogue/categories');
    }),

  getCategoryTree: protectedProcedure
    .query(async () => {
      return catalogueFetch('/api/v1/catalogue/categories/tree');
    }),

  listVendors: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.page) params.set('page', String(input.page));
      if (input?.limit) params.set('limit', String(input.limit));
      return catalogueFetch(`/api/v1/catalogue/vendors?${params}`);
    }),

  getVendor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return catalogueFetch(`/api/v1/catalogue/vendors/${input.id}`);
    }),
});
