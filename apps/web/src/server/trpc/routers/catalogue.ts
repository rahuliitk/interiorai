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
  // ── Product Queries ──────────────────────────────────────────
  listProducts: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      categoryId: z.string().optional(),
      vendorId: z.string().optional(),
      brand: z.string().optional(),
      material: z.string().optional(),
      status: z.string().optional(),
      sortBy: z.string().default('name'),
    }))
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      params.set('page', String(input.page));
      params.set('limit', String(input.limit));
      if (input.categoryId) params.set('category_id', input.categoryId);
      if (input.vendorId) params.set('vendor_id', input.vendorId);
      if (input.brand) params.set('brand', input.brand);
      if (input.material) params.set('material', input.material);
      if (input.status) params.set('status', input.status);
      params.set('sort_by', input.sortBy);
      return catalogueFetch(`/api/v1/products?${params}`);
    }),

  searchProducts: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const params = new URLSearchParams({ q: input.query, limit: String(input.limit) });
      return catalogueFetch(`/api/v1/products/search?${params}`);
    }),

  getProduct: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return catalogueFetch(`/api/v1/products/${input.id}`);
    }),

  // ── Product Mutations ────────────────────────────────────────
  createProduct: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      brand: z.string().optional(),
      category: z.string(),
      categoryId: z.string().optional(),
      subcategory: z.string().optional(),
      vendorId: z.string().optional(),
      sku: z.string().optional(),
      unit: z.string().default('piece'),
      material: z.string().optional(),
      finish: z.string().optional(),
      color: z.string().optional(),
      tags: z.array(z.string()).optional(),
      specifications: z.record(z.unknown()).optional(),
      dimensions: z.object({
        length_mm: z.number().optional(),
        width_mm: z.number().optional(),
        height_mm: z.number().optional(),
      }).optional(),
      prices: z.array(z.object({
        vendor_id: z.string(),
        price: z.number(),
        currency: z.string().default('INR'),
        unit: z.string().default('piece'),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      return catalogueFetch('/api/v1/products', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  updateProduct: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      brand: z.string().optional(),
      category: z.string().optional(),
      material: z.string().optional(),
      finish: z.string().optional(),
      color: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      prices: z.array(z.object({
        vendor_id: z.string(),
        price: z.number(),
        currency: z.string().default('INR'),
        unit: z.string().default('piece'),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...body } = input;
      return catalogueFetch(`/api/v1/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }),

  deleteProduct: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return catalogueFetch(`/api/v1/products/${input.id}`, { method: 'DELETE' });
    }),

  // ── Visual Search ────────────────────────────────────────────
  visualSearch: protectedProcedure
    .input(z.object({
      imageUrl: z.string().optional(),
      embedding: z.array(z.number()).optional(),
      limit: z.number().default(10),
    }))
    .mutation(async ({ input }) => {
      return catalogueFetch('/api/v1/products/visual-search', {
        method: 'POST',
        body: JSON.stringify({
          image_url: input.imageUrl,
          embedding: input.embedding,
          limit: input.limit,
        }),
      });
    }),

  // ── Price Comparison ─────────────────────────────────────────
  compareProductPrices: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ input }) => {
      return catalogueFetch(`/api/v1/products/${input.productId}/prices`);
    }),

  // ── Category Queries & Mutations ─────────────────────────────
  listCategories: protectedProcedure
    .query(async () => {
      return catalogueFetch('/api/v1/categories');
    }),

  getCategoryTree: protectedProcedure
    .query(async () => {
      return catalogueFetch('/api/v1/categories/tree');
    }),

  createCategory: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      parentId: z.string().optional(),
      icon: z.string().optional(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return catalogueFetch('/api/v1/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          parent_id: input.parentId,
          icon: input.icon,
          image_url: input.imageUrl,
        }),
      });
    }),

  updateCategory: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...body } = input;
      return catalogueFetch(`/api/v1/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return catalogueFetch(`/api/v1/categories/${input.id}`, { method: 'DELETE' });
    }),

  // ── Vendor Queries & Mutations ───────────────────────────────
  listVendors: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.page) params.set('page', String(input.page));
      if (input?.limit) params.set('limit', String(input.limit));
      return catalogueFetch(`/api/v1/vendors?${params}`);
    }),

  getVendor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return catalogueFetch(`/api/v1/vendors/${input.id}`);
    }),

  createVendor: protectedProcedure
    .input(z.object({
      name: z.string(),
      code: z.string().optional(),
      description: z.string().optional(),
      website: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      gstNumber: z.string().optional(),
      paymentTerms: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return catalogueFetch('/api/v1/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          code: input.code,
          description: input.description,
          website: input.website,
          contact_email: input.contactEmail,
          contact_phone: input.contactPhone,
          address: input.address,
          city: input.city,
          state: input.state,
          gst_number: input.gstNumber,
          payment_terms: input.paymentTerms,
        }),
      });
    }),

  updateVendor: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      website: z.string().optional(),
      contactEmail: z.string().optional(),
      city: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...body } = input;
      return catalogueFetch(`/api/v1/vendors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }),

  deleteVendor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return catalogueFetch(`/api/v1/vendors/${input.id}`, { method: 'DELETE' });
    }),
});
