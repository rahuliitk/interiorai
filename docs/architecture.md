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

| Layer | Technology | Specialized Tools | Rationale |
|-------|-----------|------------------|-----------|
| Web Frontend | Next.js 15 + React 19 | — | Server components, great DX |
| 3D Editor | Three.js + React Three Fiber | GaussianSplats3D, Model Viewer | WebGL-based, handles AR/VR/PBR natively |
| Mobile | React Native or Flutter | ARKit/ARCore | Cross-platform, native SLAM |
| API Layer | Node.js (TypeScript) | — | Type-safe, fast, large ecosystem |
| ML Services | Python (FastAPI) | SAM 2, Depth Anything V2 | CV models for pixel-level output |
| VLM/LLM APIs | Python (LangGraph) | LiteLLM | Users bring API keys — no local serving |
| CAD/Drawing | Python | LibreDWG, ezdxf, IfcOpenShell | DWG reading + DXF generation + BIM export |
| Optimization | Python | OR-Tools, DeepNest, rectpack | NP-hard problems require solvers |
| MEP Engineering | Python (LangGraph) | — | Fully LLM agent-driven |
| Database | PostgreSQL 16 + pgvector | pgvector | Reliable, spatial data, vector search |
| Cache | Redis 7 | — | Session, real-time, job queues |
| Search | Meilisearch | Meilisearch | Fast, typo-tolerant product search |
| File Storage | S3 / GCS / MinIO | MinIO | Scalable binary storage, self-hostable |
| Real-time | WebSocket | Y.js, Socket.IO | Collaborative editing, live updates |
| Event Streaming | NATS | NATS | High-performance pub/sub messaging |
| Workflow Engine | Temporal | Temporal | Durable long-running workflows |
| CI/CD | GitHub Actions | — | Built-in, free for open source |
| Infrastructure | Docker + Kubernetes | — | Container orchestration |
| IaC | Terraform | — | Multi-cloud infrastructure |

### LLM Agent Integration Map

The following shows how LLM agents orchestrate specialized tools in the primary data pipeline:

```
Photo Upload → OpenCV (validation) → COLMAP (SfM) → Open3D (mesh processing)
                                                          ↓
                                              Multimodal VLM (object identification)
                                                          ↓
                                              SAM 2 (pixel segmentation, prompted by LLM)
                                                          ↓
                                              Depth Anything V2 (depth estimation)
                                                          ↓
                                              Multimodal VLM (floor plan parsing → structured JSON)
                                                          ↓
                                              ezdxf (DXF generation, code written by LLM agent)
                                                          ↓
VLM API (via LiteLLM): room photo + style instructions → redesigned design image
                                                          ↓
LLM Agent: BOM calculation → OR-Tools (optimization) → rectpack/DeepNest → ezdxf (CNC)
                                                          ↓
LLM Agent: MEP calculations (NEC/IPC/ASHRAE formulas → Outlines structured output)
                                                          ↓
LLM Agent: Schedule generation → Temporal (workflow) → OR-Tools (critical path)
```

> LLM agents are the orchestration layer. They decide what to do; specialized tools execute what agents cannot. See `TECH_STACK.md` for the complete map.

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
