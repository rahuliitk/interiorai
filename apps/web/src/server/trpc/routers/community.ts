import { z } from 'zod';
import {
  offcutListings, offcutInquiries, projectGalleryEntries, contractorReferrals,
  projects, contractors,
  eq, and, or, ilike, sql,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const communityRouter = router({
  // ── Offcut Marketplace ─────────────────────────────────────────────────────

  // 1. Create a new offcut listing
  createListing: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        materialType: z.string(),
        quantity: z.number().positive(),
        unit: z.string(),
        dimensions: z.record(z.unknown()).optional(),
        condition: z.enum(['new', 'like_new', 'good', 'fair']).optional(),
        askingPrice: z.number().positive().optional(),
        currency: z.string().optional(),
        imageKeys: z.array(z.string()).optional(),
        location: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [listing] = await ctx.db
        .insert(offcutListings)
        .values({
          userId: ctx.userId,
          title: input.title,
          materialType: input.materialType,
          quantity: input.quantity,
          unit: input.unit,
          dimensions: input.dimensions,
          condition: input.condition ?? 'new',
          askingPrice: input.askingPrice,
          currency: input.currency,
          imageKeys: input.imageKeys,
          location: input.location,
        })
        .returning();
      return listing;
    }),

  // 2. List active offcut listings (with search + pagination)
  listListings: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        materialType: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(offcutListings.status, 'active')];

      if (input.search) {
        conditions.push(
          or(
            ilike(offcutListings.title, `%${input.search}%`),
            ilike(offcutListings.materialType, `%${input.search}%`),
          )!,
        );
      }

      if (input.materialType) {
        conditions.push(eq(offcutListings.materialType, input.materialType));
      }

      const listings = await ctx.db
        .select()
        .from(offcutListings)
        .where(and(...conditions))
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(sql`${offcutListings.createdAt} DESC`);

      return listings;
    }),

  // 3. Get a single listing (with inquiries only if owner)
  getListing: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.offcutListings.findFirst({
        where: eq(offcutListings.id, input.id),
        with: { inquiries: true },
      });
      if (!listing) throw new Error('Listing not found');

      // Strip inquiries if the current user is not the listing owner
      if (listing.userId !== ctx.userId) {
        return { ...listing, inquiries: [] };
      }

      return listing;
    }),

  // 4. Update a listing (verify ownership)
  updateListing: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        materialType: z.string().optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        dimensions: z.record(z.unknown()).optional(),
        condition: z.enum(['new', 'like_new', 'good', 'fair']).optional(),
        askingPrice: z.number().positive().optional(),
        currency: z.string().optional(),
        imageKeys: z.array(z.string()).optional(),
        location: z.string().optional(),
        status: z.enum(['active', 'sold', 'expired', 'removed']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(offcutListings)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(offcutListings.id, id), eq(offcutListings.userId, ctx.userId)))
        .returning();
      if (!updated) throw new Error('Listing not found or not owned by you');
      return updated;
    }),

  // 5. Delete a listing (verify ownership)
  deleteListing: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.offcutListings.findFirst({
        where: and(eq(offcutListings.id, input.id), eq(offcutListings.userId, ctx.userId)),
      });
      if (!existing) throw new Error('Listing not found or not owned by you');

      await ctx.db
        .delete(offcutListings)
        .where(and(eq(offcutListings.id, input.id), eq(offcutListings.userId, ctx.userId)));
      return { success: true };
    }),

  // 6. Create an inquiry on a listing
  createInquiry: protectedProcedure
    .input(
      z.object({
        listingId: z.string(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify listing exists and is active
      const listing = await ctx.db.query.offcutListings.findFirst({
        where: and(eq(offcutListings.id, input.listingId), eq(offcutListings.status, 'active')),
      });
      if (!listing) throw new Error('Listing not found or no longer active');

      const [inquiry] = await ctx.db
        .insert(offcutInquiries)
        .values({
          listingId: input.listingId,
          buyerUserId: ctx.userId,
          message: input.message,
        })
        .returning();
      return inquiry;
    }),

  // 7. Respond to an inquiry (listing owner updates inquiry status)
  respondToInquiry: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['pending', 'replied', 'accepted', 'declined']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch the inquiry and its parent listing to verify ownership
      const inquiry = await ctx.db.query.offcutInquiries.findFirst({
        where: eq(offcutInquiries.id, input.id),
        with: { listing: true },
      });
      if (!inquiry) throw new Error('Inquiry not found');
      if (inquiry.listing.userId !== ctx.userId) {
        throw new Error('Only the listing owner can respond to inquiries');
      }

      const [updated] = await ctx.db
        .update(offcutInquiries)
        .set({ status: input.status })
        .where(eq(offcutInquiries.id, input.id))
        .returning();
      return updated;
    }),

  // ── Project Gallery ────────────────────────────────────────────────────────

  // 8. Publish a project to the community gallery
  publishToGallery: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        imageKeys: z.array(z.string()).optional(),
        style: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [entry] = await ctx.db
        .insert(projectGalleryEntries)
        .values({
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          tags: input.tags,
          imageKeys: input.imageKeys,
          style: input.style,
        })
        .returning();
      return entry;
    }),

  // 9. Browse public gallery entries (with search + pagination)
  browseGallery: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        style: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(projectGalleryEntries.isPublic, true)];

      if (input.search) {
        conditions.push(
          or(
            ilike(projectGalleryEntries.title, `%${input.search}%`),
            ilike(projectGalleryEntries.description, `%${input.search}%`),
          )!,
        );
      }

      if (input.style) {
        conditions.push(eq(projectGalleryEntries.style, input.style));
      }

      const entries = await ctx.db
        .select()
        .from(projectGalleryEntries)
        .where(and(...conditions))
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(sql`${projectGalleryEntries.createdAt} DESC`);

      return entries;
    }),

  // 10. Like a gallery entry (increment likes count)
  likeGalleryEntry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.projectGalleryEntries.findFirst({
        where: eq(projectGalleryEntries.id, input.id),
      });
      if (!entry) throw new Error('Gallery entry not found');

      const [updated] = await ctx.db
        .update(projectGalleryEntries)
        .set({ likes: sql`${projectGalleryEntries.likes} + 1` })
        .where(eq(projectGalleryEntries.id, input.id))
        .returning();
      return updated;
    }),

  // ── Contractor Referrals ───────────────────────────────────────────────────

  // 11. Refer a contractor to someone via email
  referContractor: protectedProcedure
    .input(
      z.object({
        contractorId: z.string(),
        refereeEmail: z.string().email(),
        message: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify contractor exists
      const contractor = await ctx.db.query.contractors.findFirst({
        where: eq(contractors.id, input.contractorId),
      });
      if (!contractor) throw new Error('Contractor not found');

      const [referral] = await ctx.db
        .insert(contractorReferrals)
        .values({
          referrerUserId: ctx.userId,
          contractorId: input.contractorId,
          refereeEmail: input.refereeEmail,
          message: input.message,
        })
        .returning();
      return referral;
    }),
});
