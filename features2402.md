# OpenLintel — Feature Status Report (24 Feb 2026)

OpenLintel is an end-to-end home design automation platform that automates the full pipeline:
`Photos/Floor Plans → AI Design → Technical Drawings → BOM → CNC Cut Lists → MEP Engineering → Procurement → Project Execution → Handover`

---

## Developed Features (37)

### Core Platform

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 1 | **Authentication & User Management** | NextAuth v5 with email/password + OAuth, RBAC (user/admin), user preferences (currency, units, locale) | `apps/web/src/lib/auth.ts`, `packages/db/src/schema/auth.ts` |
| 2 | **Project & Room Management** | Create/list/delete projects; add rooms with type, dimensions, floor number; 15+ room types supported | `apps/web/src/server/trpc/routers/project.ts`, `room.ts` |
| 3 | **File Upload System** | Image & PDF upload (max 10MB), thumbnail generation, perceptual hashing for dedup, MinIO/S3 storage | `apps/web/src/app/api/upload/route.ts` |
| 4 | **Admin Panel** | Platform stats, user management, system health monitoring, job queue monitoring | `apps/web/src/app/(admin)/admin/` |

### AI & Design

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 5 | **AI Design Generation** | Multi-provider VLM (OpenAI/Anthropic/Google) via LangGraph; 10 styles, 4 budget tiers; async job queue | `services/design-engine/`, `apps/web/src/server/trpc/routers/designVariant.ts` |
| 6 | **Floor Plan Digitization** | Upload floor plan image → AI extracts rooms, dimensions, polygons; interactive SVG viewer | `apps/web/src/app/(dashboard)/project/[id]/floor-plan/page.tsx`, `services/vision-engine/` |
| 7 | **3D Interactive Editor** | React Three Fiber editor with furniture catalogue, move/rotate/scale tools, undo/redo, snap-to-grid, material panel, lighting, real-time collaboration via Y.js | `apps/web/src/app/(dashboard)/project/[id]/editor/page.tsx` |
| 8 | **Style Quiz & Mood Board** | 5-step wizard quiz, AI-detected style preferences, budget tier detection, color palette, mood board items | `apps/web/src/app/(dashboard)/project/[id]/style-quiz/page.tsx` |
| 9 | **AR/VR Viewer (WebXR)** | AR furniture placement, VR room walkthrough with teleportation, QR sharing, device capability detection | `apps/web/src/app/(dashboard)/project/[id]/ar/page.tsx` |

### Engineering & Technical

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 10 | **Bill of Materials (BOM)** | AI-generated BOM per design variant, category-wise grouping, CSV export, material substitution suggestions | `services/bom-engine/`, `apps/web/src/server/trpc/routers/bom.ts` |
| 11 | **Technical Drawing Generation** | DXF, PDF, SVG output; floor plans, elevations, sections, RCP, flooring, electrical drawings | `services/drawing-generator/` |
| 12 | **CNC Cut List & Nesting** | Panel cut lists with grain direction & edge banding, nesting optimization for 8x4 sheets, offcut tracking, DXF output | `services/cutlist-engine/` |
| 13 | **MEP Engineering** | Electrical (NEC 2020), Plumbing (IPC 2021), HVAC (ASHRAE 90.1) calculations via AI agents | `services/mep-calculator/`, `apps/web/src/app/(dashboard)/project/[id]/mep/page.tsx` |
| 14 | **Building Code Compliance** | Indian NBC 2016 checks — room dimensions, ventilation, fire safety, electrical, plumbing, accessibility | `apps/web/src/app/(dashboard)/project/[id]/compliance/page.tsx` |

### Project Management

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 15 | **Project Timeline & Scheduling** | AI-generated Gantt chart, critical path calculation, Gantt export | `services/project-service/`, `apps/web/src/components/gantt-chart.tsx` |
| 16 | **Site Logs** | Daily logs with date, title, notes, weather, worker count, photo attachments, tags | `apps/web/src/app/(dashboard)/project/[id]/site-logs/page.tsx` |
| 17 | **Change Orders** | AI-powered cost + time impact analysis, status workflow (proposed → approved/rejected → implemented) | `apps/web/src/components/change-order-dialog.tsx` |
| 18 | **Quality Assurance & Punch List** | Stage-gate checkpoints, per-item pass/fail, punch list with severity levels, status tracking | `apps/web/src/app/(dashboard)/project/[id]/quality/page.tsx` |
| 19 | **Handover Package** | As-built drawings, material register, contractor directory, operational guides, maintenance manual, client signature | `apps/web/src/app/(dashboard)/project/[id]/handover/page.tsx` |

### Collaboration & Communication

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 20 | **Real-time Collaboration (Y.js)** | CRDT-based document sharing, WebSocket rooms, cursor awareness, comment threading, approval flows | `services/collaboration/` |
| 21 | **Collaboration Hub** | Threaded discussions per project/room, @mentions, decision logging, attachments, thread status workflow | `apps/web/src/app/(dashboard)/project/[id]/collaboration/page.tsx` |
| 22 | **Notifications** | Real-time notification system with bell component, WebSocket push | `apps/web/src/components/notification-bell.tsx`, `services/collaboration/src/routes/notifications.ts` |

### Finance & Procurement

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 23 | **Payments & Invoices** | Stripe + Razorpay integration, milestone-linked payments | `apps/web/src/server/trpc/routers/payment.ts` |
| 24 | **Procurement & Purchase Orders** | Phasing agent, order splitter, delivery tracker | `services/procurement-service/` |
| 25 | **Delivery Tracking** | Material delivery lifecycle (pending → delivered → inspected), tracking numbers, inspection checklists | `apps/web/src/app/(dashboard)/project/[id]/deliveries/page.tsx` |
| 26 | **Financial Reports** | Budget vs. actuals, expenditure timeline, category-wise spend breakdown | `apps/web/src/app/(dashboard)/project/[id]/financial-reports/page.tsx` |

### Marketplace & Ecosystem

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 27 | **Contractor Marketplace** | Search/filter by city & specialization, contractor profiles, reviews & ratings, hire dialog, referral system | `apps/web/src/app/(dashboard)/marketplace/page.tsx` |
| 28 | **Product Catalogue** | Multi-vendor price comparison, pgvector visual similarity search, text search | `services/catalogue-service/`, `apps/web/src/app/(dashboard)/marketplace/catalogue/page.tsx` |
| 29 | **Vendor Performance Management** | Vendor delivery/quality/pricing ratings, order history | `apps/web/src/app/(dashboard)/project/[id]/vendors/page.tsx` |
| 30 | **Offcuts Exchange Marketplace** | List & browse leftover material offcuts, inquiries, project gallery showcase | `apps/web/src/app/(dashboard)/marketplace/offcuts/` |
| 31 | **Developer API Portal** | OAuth app registration, scope-based access, rate limit tiers, webhook subscriptions, request logs | `apps/web/src/app/(dashboard)/developer/` |

### Intelligence & Analytics

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 32 | **Analytics Dashboard** | Budget vs. actual charts, cost breakdown, timeline progress, per-sqft benchmarks, CSV export | `apps/web/src/app/(dashboard)/analytics/page.tsx` |
| 33 | **AI Cost & Timeline Predictions** | LLM-powered cost range predictions with confidence intervals, risk factors, phase breakdown | `apps/web/src/server/trpc/routers/prediction.ts` |
| 34 | **Budget Optimizer** | AI material substitution suggestions with savings estimates | `apps/web/src/server/trpc/routers/budgetOptimization.ts` |
| 35 | **Sustainability Scoring** | Carbon footprint calculation, LEED points estimate, green alternatives | `apps/web/src/server/trpc/routers/sustainability.ts` |
| 36 | **Portfolio Management** | Group multiple projects into named portfolios | `apps/web/src/app/(dashboard)/portfolios/` |

### Post-Occupancy

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 37 | **Digital Twin & IoT** | Digital twin per project, IoT sensor management (8 types), live device dashboard, emergency references | `apps/web/src/app/(dashboard)/project/[id]/digital-twin/page.tsx` |
| 38 | **Maintenance Scheduling** | Scheduled maintenance items with frequency, next due date, cost estimate, completion logging | `apps/web/src/app/(dashboard)/project/[id]/maintenance/page.tsx` |
| 39 | **Warranty Tracking** | Track warranties by type (manufacturer/extended/contractor), file warranty claims with photos | `apps/web/src/app/(dashboard)/project/[id]/warranties/page.tsx` |

### Cross-Cutting

| # | Feature | Description | Key Files |
|---|---------|-------------|-----------|
| 40 | **Localization** | Multi-currency with exchange rate caching, metric/imperial unit system, locale preferences | `apps/web/src/server/trpc/routers/localization.ts`, `apps/web/src/lib/currency.ts` |

### ML Modules

| # | Module | Description | Path |
|---|--------|-------------|------|
| 41 | **Room Segmentation** | SAM2 + VLM detector for room detection from photos | `ml/room-segmentation/` |
| 42 | **Floor Plan Digitizer** | VLM extractor + image preprocessor → structured rooms + DXF | `ml/floor-plan-digitizer/` |
| 43 | **Design Generation Model** | LangGraph multi-node graph with style database | `ml/design-gen/` |
| 44 | **AI Measurement Estimation** | Depth-to-metric conversion, multi-view geometry, calibration | `ml/measurement/` |

---

## Pending / Not Yet Implemented (10)

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | **Mobile App** | Not started | React Native / Flutter planned; only a README placeholder exists at `apps/mobile/` |
| 2 | **Desktop App** | Not started | Electron / Tauri planned; only a README placeholder exists at `apps/desktop/` |
| 3 | **Visual Product Matching (ML)** | Stub only | Package exists at `ml/product-matching/` but contains only `__init__.py` — no matching logic |
| 4 | **Photo-to-3D Reconstruction** | Not implemented | Mentioned in README as a key capability; measurement ML module exists but no end-to-end 3D reconstruction pipeline connected to the frontend |
| 5 | **Vision Engine Deployment** | Service code ready, deployment pending | `services/vision-engine/` has no Dockerfile; floor plan UI shows "requires vision-engine microservice" notice |
| 6 | **Retailer API Integrations** | Not implemented | REQUIREMENTS.md describes live pricing from Amazon India, Flipkart, IKEA, etc. — catalogue service supports multi-vendor pricing but no actual retailer API connections |
| 7 | **IFC/BIM Export** | Not implemented | DXF output works, but full IFC (Industry Foundation Classes) or native DWG export is not available |
| 8 | **Global Building Codes** | Partial | Only Indian NBC 2016 compliance is implemented; US IRC, EU codes, and others are not yet supported |
| 9 | **Full Kubernetes Production Deployment** | Partial | K8s manifests exist for ~2 of 10+ services in `infra/k8s/`; Terraform configs are incomplete stubs |
| 10 | **Change Order Full-Page UI** | Partial | Backend AI agent and dialog exist, but no dedicated full-page change order management view |

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React Three Fiber, tRPC, Tailwind CSS |
| Backend | Python FastAPI microservices (10), TypeScript collaboration service |
| Database | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| ML | SAM2, LangGraph, multi-provider VLMs (OpenAI/Anthropic/Google) |
| Storage | MinIO / S3 |
| Cache | Redis |
| Search | Meilisearch |
| Payments | Stripe, Razorpay |
| Real-time | WebSocket, Y.js CRDT |
| AR/VR | WebXR |
| Infra | Docker Compose, Kubernetes (partial), Terraform (partial) |
| Monorepo | pnpm workspaces + Turborepo |
