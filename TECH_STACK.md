# OpenLintel Technology Stack

> Use LLM/VLM APIs for everything they're good at. Use open-source tools only where they fundamentally can't — pixel-level vision, 3D geometry, binary file formats, GPU rendering, and combinatorial optimization. No local model serving; users bring their own API keys.

---

## Architecture Philosophy

```
User's API Key (OpenAI / Gemini / Anthropic / etc.)
        ↓
    LiteLLM (unified API)
        ↓
    LangGraph (agent orchestration)
        ↓
    Specialized tools (only what LLMs can't do)
```

**Three layers:**
1. **VLM/LLM APIs** — design generation, floor plan reading, engineering calculations, all reasoning
2. **LangGraph** — multi-step agent workflows, tool calling, state management
3. **Specialized tools** — pixel masks, depth maps, 3D reconstruction, file formats, optimization solvers

### What we don't use and why

| Removed | Why | Replacement |
|---------|-----|-------------|
| Diffusers, SDXL/FLUX, ControlNet, IP-Adapter, IC-Light | VLMs generate design images directly from photos + instructions | VLM APIs (GPT-4o, Gemini, etc.) |
| Ollama, vLLM | No local model serving — users bring API keys | LiteLLM unified API |
| Outlines | Designed for local constrained decoding | API-native structured output + Pydantic |
| Blender Python API | VLMs generate concepts; Three.js handles 3D; Gaussian Splats handle photorealism | Not needed |
| CubiCasa5k, RoomFormer | Fragile academic models | Multimodal VLM reads floor plans directly |
| Grounding DINO, YOLO | VLM vision identifies objects with natural language | Multimodal VLM |
| ComfyUI | Visual UI, not production code | LangGraph agent orchestrates in code |
| CrewAI, LlamaIndex | Redundant abstractions | LangGraph + pgvector |
| EnergyPlus, EPpy, OpenStudio, Ladybug, python-hvac | Building-scale overkill for residential | LLM agent with cited formulas |
| CadQuery, Build123d, pythonOCC | Parametric scripting is what LLMs excel at | LLM agent generates ezdxf code |
| PuLP, libnest2d | Redundant | OR-Tools + DeepNest/rectpack |
| A-Frame, Google Filament, Meshroom, ORB-SLAM3, Celery | Redundant or replaced | Consolidated alternatives |

---

## LLM/VLM API Layer

> The brain of OpenLintel. No local models — users plug in their preferred provider's API key.

### Unified API — LiteLLM (MIT)

- **GitHub:** https://github.com/BerriAI/litellm
- **Role:** Single interface to 100+ LLM/VLM providers (OpenAI, Gemini, Anthropic, Azure, Bedrock, Mistral, Groq, etc.). Users configure one API key, the platform works.

### Agent Orchestration — LangGraph (MIT)

- **GitHub:** https://github.com/langchain-ai/langgraph
- **Role:** THE orchestration framework. Handles:
  - Multi-step agent workflows (design → BOM → drawings → procurement)
  - Tool calling (ezdxf, OR-Tools, SAM 2, etc.)
  - Multi-agent coordination
  - State management across long-running projects
  - RAG over building codes and material specs (via pgvector)

### What VLM/LLM APIs handle across OpenLintel:

| Service | What the API does |
|---------|-------------------|
| **design-engine** | Generate redesigned room images from photos + style instructions |
| **drawing-generator** | Calculate coordinates, generate ezdxf code, produce drawing specs |
| **cutlist-engine** | Break furniture into panels, generate cut lists |
| **mep-calculator** | All engineering calculations with NEC/IPC/ASHRAE formulas |
| **bom-engine** | Calculate quantities, waste factors, material substitutions |
| **catalogue-service** | Product recommendations, compatibility checking |
| **procurement-service** | Vendor evaluation, order optimization |
| **project-service** | Schedule generation, dependency analysis, change impact |
| **floor-plan-digitizer** | Read floor plan images, extract rooms/dimensions/doors/windows |
| **room-segmentation** | Identify objects, prompt SAM 2, interpret scenes |
| **measurement** | Reference object detection, dimension calibration |
| **product-matching** | Photo interpretation, intent understanding, result ranking |

---

## Computer Vision & 3D Reconstruction

> VLMs handle scene understanding and object identification. These tools handle pixel-level output that VLMs cannot produce.

### Segmentation — SAM 2 (Apache-2.0)

- **GitHub:** https://github.com/facebookresearch/sam2
- **Why it stays:** VLMs output text, not pixel masks. SAM 2 produces precise segmentation maps.
- **Role:** Room element segmentation. VLM identifies what to segment; SAM 2 produces the mask.

### Depth Estimation — Depth Anything V2 (Apache-2.0)

- **GitHub:** https://github.com/DepthAnything/Depth-Anything-V2
- **Why it stays:** Dense per-pixel depth maps require a specialized neural network.
- **Role:** Room dimension estimation, 3D reconstruction support, AR measurement.

### Photogrammetry — COLMAP (BSD-3)

- **GitHub:** https://github.com/colmap/colmap
- **Why it stays:** 3D reconstruction from photos is geometric computation.
- **Role:** Structure-from-Motion reconstruction of room geometry from multiple photos.

### 3D Processing — Open3D (MIT)

- **GitHub:** https://github.com/isl-org/Open3D
- **Why it stays:** Point cloud and mesh manipulation requires specialized geometry code.
- **Role:** Point cloud processing, mesh cleaning, model manipulation.

### 3D Gaussian Splatting (Custom)

- **GitHub:** https://github.com/graphdeco-inria/gaussian-splatting
- **Why it stays:** Novel view synthesis via GPU rendering.
- **Role:** Photorealistic navigable 3D room captures for digital twins.

### Visual Embeddings — CLIP / DINOv2 (MIT / Apache-2.0)

- **GitHub:** https://github.com/openai/CLIP / https://github.com/facebookresearch/dinov2
- **Why it stays:** Efficient vector embeddings at scale — VLMs are too slow for 10M+ comparisons.
- **Role:** Product catalogue visual similarity search via pgvector.

---

## CAD & Technical Drawing

> LLM agents generate drawing logic. These tools handle binary file format I/O.

### DWG Reading — LibreDWG (GPL-3.0)

- **GitHub:** https://github.com/LibreDWG/libredwg
- **Why it's here:** DWG is the industry-standard CAD format (Autodesk proprietary). Most real-world files arrive as DWG. LibreDWG reads DWG and converts to DXF for processing.
- **Role:** DWG → DXF conversion on ingest. Accepts architect/contractor uploads in native format.

### DXF I/O — ezdxf (MIT)

- **GitHub:** https://github.com/mozman/ezdxf
- **Why it stays:** DXF is a precise structured format that must be written byte-correct.
- **Role:** Core DXF processing — read converted DWG files, generate floor plans, elevations, sections, cut list layouts, CNC output. LLM agent generates the drawing code; ezdxf writes the file.

### BIM/IFC — IfcOpenShell (LGPL-3.0)

- **GitHub:** https://github.com/IfcOpenShell/IfcOpenShell
- **Why it stays:** IFC is the open BIM standard — complex structured format.
- **Role:** Import/export IFC files for BIM interoperability.

### Pipeline:

```
User uploads DWG → LibreDWG (dwg2dxf) → ezdxf reads DXF → process geometry
                                                                    ↓
LLM agent generates new drawings → ezdxf writes DXF → user opens in any CAD
                                                                    ↓
                                            IfcOpenShell writes IFC → BIM tools
```

---

## 3D Graphics & Rendering

> GPU-bound rendering. LLM agents orchestrate scene setup.

### Web 3D Engine — Three.js + React Three Fiber (MIT)

- **GitHub:** https://github.com/mrdoob/three.js / https://github.com/pmndrs/react-three-fiber
- **Role:** Core 3D engine — room visualization, design preview, interactive editor, WebXR AR/VR, PBR materials.

### AR Preview — Google Model Viewer (Apache-2.0)

- **GitHub:** https://github.com/google/model-viewer
- **Role:** Lightweight AR preview of furniture/fixtures from catalogue.

### Gaussian Splat Viewer — GaussianSplats3D (MIT)

- **GitHub:** https://github.com/mkkellogg/GaussianSplats3D
- **Role:** Web viewer for photorealistic Gaussian Splat room captures.

---

## Optimization

> LLM agents formulate problems. Solvers handle NP-hard computation.

### Google OR-Tools (Apache-2.0)

- **GitHub:** https://github.com/google/or-tools
- **Role:** Constraint programming, LP/MILP, routing, scheduling. Furniture layout, procurement routing, construction scheduling, budget allocation.

### DeepNest (MIT)

- **GitHub:** https://github.com/Jack000/DeepNest
- **Role:** 2D nesting for irregular shapes — tile and stone cutting optimization.

### rectpack (Apache-2.0)

- **GitHub:** https://github.com/secnot/rectpack
- **Role:** Rectangle bin-packing for CNC panel cut lists.

### SciPy (BSD-3)

- **GitHub:** https://github.com/scipy/scipy
- **Role:** Foundational scientific computing — spatial calculations, engineering math.

---

## MEP Engineering

> **Fully LLM-driven** for residential scale. No specialized tools.

The LLM agent (via LangGraph + VLM/LLM API) performs all calculations:

- **Electrical:** Load calculation, wire gauge (NEC Table 310.16), voltage drop, panel schedule
- **Plumbing:** Fixture units (IPC Table 604.4), pipe sizing, drainage slope, hot water sizing
- **HVAC:** Cooling/heating load (ASHRAE Manual J), equipment sizing, duct sizing
- **Fire safety:** Smoke detector placement (NFPA 72), extinguisher locations

Every calculation cites its source standard and clause number. Validated against textbook values in unit tests.

---

## Infrastructure & Platform

### Temporal (MIT)

- **GitHub:** https://github.com/temporalio/temporal
- **Role:** Durable workflow orchestration for project lifecycles.

### Meilisearch (MIT)

- **GitHub:** https://github.com/meilisearch/meilisearch
- **Role:** Product catalogue full-text search with typo tolerance.

### pgvector (PostgreSQL License)

- **GitHub:** https://github.com/pgvector/pgvector
- **Role:** Vector similarity search in PostgreSQL — product matching, RAG retrieval.

### MinIO (AGPL-3.0)

- **GitHub:** https://github.com/minio/minio
- **Role:** Self-hosted S3-compatible object storage.

### Y.js + Socket.IO (MIT)

- **GitHub:** https://github.com/yjs/yjs / https://github.com/socketio/socket.io
- **Role:** Real-time collaborative editing with CRDT conflict resolution.

### NATS (Apache-2.0)

- **GitHub:** https://github.com/nats-io/nats-server
- **Role:** Inter-service event streaming.

---

## Tool Count

| Category | Tools | Count |
|----------|-------|-------|
| LLM/VLM API Layer | LiteLLM, LangGraph | 2 |
| Computer Vision & 3D | SAM 2, Depth Anything V2, COLMAP, Open3D, Gaussian Splatting, CLIP/DINOv2 | 6 |
| CAD & Drawing | LibreDWG, ezdxf, IfcOpenShell | 3 |
| 3D Graphics | Three.js/R3F, Model Viewer, GaussianSplats3D | 3 |
| Optimization | OR-Tools, DeepNest, rectpack, SciPy | 4 |
| MEP Engineering | *(LLM-driven, no tools)* | 0 |
| Infrastructure | Temporal, Meilisearch, pgvector, MinIO, Y.js/Socket.IO, NATS | 6 |
| **Total** | | **24** |

*Started at 47 → cut to 31 → now 24. The VLM/LLM API handles design generation, floor plan parsing, object detection, engineering calculations, and all business logic. The 24 remaining tools do what APIs cannot: produce pixels, reconstruct 3D, write binary files, solve NP-hard problems, and run infrastructure.*

---

## License Compatibility

| License | Commercial | Copyleft | Notes |
|---------|-----------|----------|-------|
| MIT | Yes | No | Most permissive |
| Apache-2.0 | Yes | No | Patent grant |
| BSD-3 | Yes | No | Permissive |
| LGPL-3.0 | Yes | Weak | Library use OK |
| GPL-3.0 | Yes | Strong | LibreDWG — compatible with our AGPL |
| AGPL-3.0 | Yes | Strong | MinIO as standalone infra |

**OpenLintel is AGPL-3.0** — compatible with all above.

---

*When adding a dependency, ask: "Can a VLM/LLM API call do this?" If yes, use the API. If no, add the tool here.*
