# Architecture Overview

## System Architecture

OpenLintel follows a **microservices architecture** with an API gateway pattern.

```
Client Apps (Web, Mobile, Desktop)
        |
   API Gateway (REST / GraphQL)
        |
   ┌────┼────────────────────┐
   |    |                    |
Design  Documentation  Execution
Engine  Engine         Engine
   |    |                    |
   └────┼────────────────────┘
        |
   Shared Services
   (Catalogue, Auth, Storage, Search, Notifications)
```

## Design Principles

1. **API-First**: Every feature is accessible via REST/GraphQL API
2. **Event-Driven**: Services communicate asynchronously where possible
3. **Multi-Tenant**: Data isolation per customer
4. **Offline-First** (mobile): Critical features work without connectivity
5. **Pluggable Standards**: Engineering calculations support multiple regional codes

## Tech Stack

| Layer | Technology | Key Open-Source Tools | Rationale |
|-------|-----------|----------------------|-----------|
| Web Frontend | Next.js 15 + React 19 | — | Server components, great DX |
| 3D Editor | Three.js + React Three Fiber | GaussianSplats3D, A-Frame, Model Viewer | WebGL-based, React integration, AR support |
| Mobile | React Native or Flutter | — | Cross-platform, native performance |
| API Layer | Node.js (TypeScript) | — | Type-safe, fast, large ecosystem |
| ML Services | Python (FastAPI) | SAM 2, Depth Anything V2, Diffusers, ControlNet | ML ecosystem, PyTorch compatibility |
| LLM/Agents | Python | Ollama, vLLM, LangGraph, CrewAI, Outlines | Local-first LLM inference, structured output |
| CAD/Drawing | Python | ezdxf, IfcOpenShell, CadQuery | DXF/IFC generation, parametric modeling |
| Optimization | Python | OR-Tools, DeepNest, rectpack | Nesting, scheduling, resource allocation |
| MEP Engineering | Python | EnergyPlus, EPpy, Ladybug Tools | Energy modeling, HVAC calculations |
| Database | PostgreSQL 16 + pgvector | pgvector | Reliable, PostGIS for spatial, vector search |
| Cache | Redis 7 | — | Session, real-time, job queues |
| Search | Meilisearch | Meilisearch | Fast, typo-tolerant product search |
| File Storage | S3 / GCS / MinIO | MinIO | Scalable binary storage, self-hostable |
| Real-time | WebSocket | Y.js, Socket.IO | Collaborative editing, live updates |
| Message Queue | NATS | NATS | High-performance event streaming |
| Task Queue | Celery / Temporal | Celery, Temporal | Async jobs, durable workflows |
| CI/CD | GitHub Actions | — | Built-in, free for open source |
| Infrastructure | Docker + Kubernetes | — | Container orchestration |
| IaC | Terraform | — | Multi-cloud infrastructure |

### Open-Source Integration Map

The following diagram shows how open-source tools connect in the primary data pipeline:

```
Photo Upload → OpenCV (validation) → COLMAP (SfM) → Open3D (mesh processing)
                                                          ↓
                                              SAM 2 + Grounding DINO (segmentation)
                                                          ↓
                                              Depth Anything V2 (depth estimation)
                                                          ↓
                                              CubiCasa5k / RoomFormer (floor plan parsing)
                                                          ↓
                                              ezdxf (DXF generation)
                                                          ↓
Design Engine: Diffusers + SDXL/FLUX → ControlNet (spatial control) → IP-Adapter (style)
                                                          ↓
                                              IC-Light (relighting) → Blender (photorealistic render)
                                                          ↓
BOM Engine → OR-Tools (optimization) → DeepNest/rectpack (nesting) → ezdxf (CNC output)
                                                          ↓
MEP Calculator: EnergyPlus + EPpy (energy) → Ladybug Tools (environmental analysis)
                                                          ↓
LLM Agents: Ollama/vLLM → LangGraph (orchestration) → Outlines (structured output)
```

> See `TECH_STACK.md` for the complete technology map with GitHub links, licenses, and detailed descriptions.

## Data Flow: Photo to Design

```
1. User uploads room photos
        |
2. Media Service: validate, optimize, store in S3
        |
3. Room Segmentation ML: identify walls, floor, ceiling, openings
        |
4. Measurement ML: estimate dimensions from depth
        |
5. Floor Plan Digitizer: generate vector floor plan
        |
6. Design Engine: generate N variants (style + budget)
        |
7. User selects and customizes a variant
        |
8. Drawing Generator: produce DWG/PDF drawing set
        |
9. BOM Engine: calculate materials + quantities
        |
10. Cut List Engine: generate CNC-ready panel lists
```

## Database Schema (High Level)

Key entities:
- **Project** → has many **Rooms**
- **Room** → has many **DesignVariants**
- **DesignVariant** → has many **BOMItems**, **Drawings**, **CutListPanels**
- **Product** → belongs to **Catalogue**, linked to **BOMItems**
- **User** → has **Role** (homeowner, designer, contractor, factory)

## Security Model

- JWT-based authentication with refresh tokens
- Role-Based Access Control (RBAC) — see REQUIREMENTS.md Section 10.1
- API rate limiting per user tier
- All external input validated with Zod (TS) or Pydantic (Python)
- File upload validation (type, size, content inspection)
- SQL injection prevention via parameterized queries (ORM)
