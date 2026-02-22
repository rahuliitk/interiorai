# OpenLintel Technology Stack

> An opinionated, LLM-agent-first approach: use AI agents for reasoning, orchestration, and business logic — use specialized tools only where LLMs fundamentally cannot operate (pixel-level vision, 3D geometry, binary file formats, GPU rendering, combinatorial optimization).

---

## Architecture Philosophy

OpenLintel follows the **"LLM Agent + Specialized Tool"** pattern:

- **LLM agents** handle: reasoning, orchestration, business logic, engineering calculations, natural language understanding, floor plan interpretation, code generation, and decision-making
- **Specialized tools** handle: pixel-level segmentation, depth estimation, 3D reconstruction, image generation, binary file I/O, GPU rendering, and NP-hard optimization

The agent decides *what* to do. The tool executes *what the agent cannot*.

### What we removed and why

| Removed | Reason | Replaced by |
|---------|--------|-------------|
| CubiCasa5k, RoomFormer | Fragile academic models, limited generalization | Multimodal LLM reads floor plans directly |
| Grounding DINO, YOLO | LLM vision identifies objects with natural language | Multimodal LLM (+ ARKit/ARCore on-device) |
| ComfyUI | Visual UI, not production code | LLM agent orchestrates Diffusers pipeline |
| CrewAI | Redundant agent framework | LangGraph handles multi-agent |
| LlamaIndex | Unnecessary abstraction | LangGraph + pgvector directly |
| EnergyPlus, EPpy, OpenStudio | Building-scale overkill for residential | LLM agent with NEC/IPC/ASHRAE formulas |
| Ladybug Tools, python-hvac | LLM computes with cited formulas | LLM agent + Outlines structured output |
| PuLP | Redundant — OR-Tools covers LP/MILP | OR-Tools |
| libnest2d | Redundant with DeepNest + rectpack | DeepNest (irregular) + rectpack (rectangular) |
| CadQuery, Build123d, pythonOCC | Parametric scripting is what LLMs excel at | LLM agent generates ezdxf code directly |
| A-Frame, Google Filament | Redundant with Three.js + R3F | Three.js handles WebXR and PBR |
| Meshroom | Redundant — COLMAP sufficient | COLMAP |
| ORB-SLAM3 | Complex C++ dep; phones have native SLAM | ARKit / ARCore |
| Celery | Temporal is strictly superior | Temporal |
| Mistral (as a named dep) | Stay model-agnostic | Ollama/vLLM serve any model |

---

## Computer Vision & 3D Reconstruction

> LLM agents handle object identification, scene understanding, and floor plan parsing. Specialized models handle pixel-level output that LLMs cannot produce.

### Segmentation — SAM 2 (Apache-2.0)

- **GitHub:** https://github.com/facebookresearch/sam2
- **Why it stays:** LLMs output text, not pixel masks. SAM 2 produces precise segmentation maps.
- **Role:** Room element segmentation (walls, floors, ceilings, doors, windows) from photos. Prompted by LLM agent identifying what to segment.

### Depth Estimation — Depth Anything V2 (Apache-2.0)

- **GitHub:** https://github.com/DepthAnything/Depth-Anything-V2
- **Why it stays:** Dense per-pixel depth maps require a specialized neural network.
- **Role:** Estimate room dimensions from photos, generate depth maps for ControlNet conditioning, support AR measurement.

### Photogrammetry — COLMAP (BSD-3)

- **GitHub:** https://github.com/colmap/colmap
- **Why it stays:** 3D reconstruction from photos is a geometric computation pipeline.
- **Role:** Structure-from-Motion reconstruction of room geometry from multiple photos.

### 3D Processing — Open3D (MIT)

- **GitHub:** https://github.com/isl-org/Open3D
- **Why it stays:** Point cloud and mesh manipulation requires specialized geometry code.
- **Role:** Point cloud processing, mesh cleaning, model manipulation in the media-service pipeline.

### 3D Gaussian Splatting (Custom)

- **GitHub:** https://github.com/graphdeco-inria/gaussian-splatting
- **Why it stays:** Novel view synthesis via GPU rendering — no LLM equivalent.
- **Role:** Photorealistic navigable 3D room captures for immersive visualization and digital twins.

### Visual Embeddings — CLIP / DINOv2 (MIT / Apache-2.0)

- **GitHub:** https://github.com/openai/CLIP / https://github.com/facebookresearch/dinov2
- **Why it stays:** Efficient vector embeddings for similarity search at scale — LLMs are too slow for 10M+ product comparisons.
- **Role:** Generate visual embeddings for product catalogue similarity search via pgvector.

### LLM Agent replaces:

- **Object detection:** Multimodal LLM identifies furniture, fixtures, architectural elements via natural language prompts (replaces Grounding DINO, YOLO)
- **Floor plan parsing:** Multimodal LLM extracts room boundaries, dimensions, doors, windows from floor plan images (replaces CubiCasa5k, RoomFormer)
- **Scene understanding:** LLM agent interprets room photos for style, condition, and spatial layout
- **On-device detection:** ARKit (iOS) / ARCore (Android) handle real-time spatial mapping (replaces ORB-SLAM3)

---

## CAD & Technical Drawing

> LLM agents generate drawing specifications, calculate coordinates, and produce parametric designs. Specialized tools handle binary file format I/O.

### DXF I/O — ezdxf (MIT)

- **GitHub:** https://github.com/mozman/ezdxf
- **Why it stays:** DXF is a precise structured format — must be written byte-correct.
- **Role:** Core DXF generation for floor plans, elevations, sections, cut list layouts, and CNC output. LLM agent generates the drawing logic; ezdxf writes the file.

### BIM/IFC — IfcOpenShell (LGPL-3.0)

- **GitHub:** https://github.com/IfcOpenShell/IfcOpenShell
- **Why it stays:** IFC is a complex industry standard format for BIM interoperability.
- **Role:** Import/export IFC files for interoperability with Revit, ArchiCAD. LLM agent orchestrates the model; IfcOpenShell serializes it.

### LLM Agent replaces:

- **Parametric CAD scripting:** LLM agent generates ezdxf drawing code directly — parametric relationships, dimensions, layers (replaces CadQuery, Build123d, pythonOCC)
- **Drawing specifications:** LLM agent reasons about what to draw, which views, dimensions, annotations
- **SVG generation:** LLM agent writes SVG markup directly for web-embeddable drawings

---

## 3D Graphics & Rendering

> Rendering is inherently GPU-bound. LLM agents orchestrate scene setup and camera placement.

### Web 3D Engine — Three.js + React Three Fiber (MIT)

- **GitHub:** https://github.com/mrdoob/three.js / https://github.com/pmndrs/react-three-fiber
- **Why it stays:** WebGL rendering requires a GPU pipeline.
- **Role:** Core 3D engine — room visualization, design preview, interactive editor, AR/VR via WebXR, PBR material rendering.

### AR Preview — Google Model Viewer (Apache-2.0)

- **GitHub:** https://github.com/google/model-viewer
- **Why it stays:** Lightweight web component for instant AR preview.
- **Role:** Quick AR preview of individual furniture/fixture items from catalogue.

### Photorealistic Rendering — Blender Python API (GPL-3.0 / Cycles Apache-2.0)

- **GitHub:** https://github.com/blender/blender
- **Why it stays:** Production-quality path tracing requires a rendering engine.
- **Role:** Headless photorealistic batch rendering of design variants. LLM agent sets up scene and materials; Blender renders.

### Gaussian Splat Viewer — GaussianSplats3D (MIT)

- **GitHub:** https://github.com/mkkellogg/GaussianSplats3D
- **Why it stays:** Specialized Three.js-based viewer for Gaussian Splat data.
- **Role:** Web-based interactive viewer for photorealistic room walkthroughs.

### LLM Agent replaces:

- **Scene composition:** LLM agent generates Three.js/R3F scene descriptions, camera positions, lighting setups
- **AR/VR frameworks:** Three.js + R3F handles WebXR natively (replaces A-Frame)
- **PBR material setup:** Three.js handles physically-based materials (replaces Google Filament)

---

## AI Design Generation

> LLM agents orchestrate the multi-step generation pipeline. Diffusion models generate the actual pixels.

### Diffusion Framework — Hugging Face Diffusers (Apache-2.0)

- **GitHub:** https://github.com/huggingface/diffusers
- **Why it stays:** Image generation requires diffusion neural networks — LLMs generate text, not pixels.
- **Role:** Core inference framework for all image generation models.

### Base Models — SDXL / FLUX.1-schnell (Apache-2.0)

- **GitHub:** https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 / https://huggingface.co/black-forest-labs/FLUX.1-schnell
- **Why they stay:** Foundation text-to-image models.
- **Role:** Generate interior design concept images from text + spatial conditioning.

### Spatial Control — ControlNet (Apache-2.0)

- **GitHub:** https://github.com/lllyasviel/ControlNet
- **Why it stays:** Specialized conditioning adapters for diffusion models.
- **Role:** Constrain design generation to match room geometry — floor plan outlines, depth maps, segmentation masks.

### Style Transfer — IP-Adapter (Apache-2.0)

- **GitHub:** https://github.com/tencent-ailab/IP-Adapter
- **Why it stays:** Image-prompt conditioning for diffusion models.
- **Role:** Transfer style from mood board / reference images to generated designs.

### Relighting — IC-Light (Apache-2.0)

- **GitHub:** https://github.com/lllyasviel/IC-Light
- **Why it stays:** Specialized relighting model.
- **Role:** Adjust lighting in design renders to match time-of-day, window orientation, and lighting design.

### LLM Agent replaces:

- **Pipeline orchestration:** LLM agent chains segment → depth → generate → style → relight → upscale steps in code (replaces ComfyUI)
- **Prompt engineering:** LLM agent crafts optimal diffusion prompts from user preferences, style quiz, and spatial context
- **Quality control:** LLM agent evaluates generated designs and re-prompts if quality/style criteria aren't met

---

## LLM & AI Agents

> The central nervous system of OpenLintel. LLM agents handle reasoning, planning, calculation, and orchestration across all services.

### Local Model Serving — Ollama (MIT)

- **GitHub:** https://github.com/ollama/ollama
- **Role:** Local LLM inference for development and self-hosted deployments. Model-agnostic — run Qwen, LLaMA, Mistral, or any open model.

### Production Serving — vLLM (Apache-2.0)

- **GitHub:** https://github.com/vllm-project/vllm
- **Role:** High-throughput production LLM serving with PagedAttention for optimal GPU utilization.

### Agent Orchestration — LangGraph (MIT)

- **GitHub:** https://github.com/langchain-ai/langgraph
- **Role:** THE agent framework for OpenLintel. Handles:
  - Multi-step design-to-delivery workflows
  - Multi-agent coordination (designer, engineer, estimator, procurement)
  - Tool calling (ezdxf, OR-Tools, Diffusers, etc.)
  - RAG over building codes, material specs, product catalogues (via pgvector)
  - State management across long-running project lifecycles

### Structured Output — Outlines (Apache-2.0)

- **GitHub:** https://github.com/dottxt-ai/outlines
- **Role:** Guarantee LLM outputs conform to typed schemas — BOM items, room specs, design parameters, engineering calculations. Critical for reliable downstream processing.

### What LLM agents handle across OpenLintel:

| Service | LLM Agent Responsibilities |
|---------|---------------------------|
| **design-engine** | Orchestrate Diffusers pipeline, craft prompts, evaluate quality |
| **drawing-generator** | Generate drawing specs, calculate coordinates, produce ezdxf code |
| **cutlist-engine** | Break furniture into panels, generate cut lists, call nesting solvers |
| **mep-calculator** | All engineering calculations with NEC/IPC/ASHRAE formulas, structured output |
| **bom-engine** | Calculate quantities, waste factors, material substitutions |
| **catalogue-service** | Product recommendations, compatibility checking, natural language search |
| **procurement-service** | Vendor evaluation, order optimization, negotiation logic |
| **project-service** | Schedule generation, dependency analysis, change impact assessment |
| **floor-plan-digitizer** | Read floor plan images, extract rooms/dimensions/doors/windows |
| **room-segmentation** | Identify objects, prompt SAM 2, interpret scene context |
| **measurement** | Reference object detection, calibration, dimension inference |
| **product-matching** | Understand user intent, interpret visual queries, rank results |

---

## Optimization

> LLM agents handle business logic and problem formulation. Specialized solvers handle NP-hard combinatorial problems.

### General Optimization — Google OR-Tools (Apache-2.0)

- **GitHub:** https://github.com/google/or-tools
- **Why it stays:** LLMs are terrible at combinatorial optimization. OR-Tools solves constraint programming, LP/MILP, routing, and scheduling problems.
- **Role:** Furniture layout optimization, procurement route planning, construction schedule optimization, budget allocation. LLM agent formulates the problem; OR-Tools solves it.

### Irregular Shape Nesting — DeepNest (MIT)

- **GitHub:** https://github.com/Jack000/DeepNest
- **Why it stays:** NP-hard 2D nesting — algorithmic solver required.
- **Role:** Optimize tile and stone cutting layouts — minimize waste on irregular shapes.

### Rectangle Packing — rectpack (Apache-2.0)

- **GitHub:** https://github.com/secnot/rectpack
- **Why it stays:** Fast bin-packing algorithms — LLMs can't solve this efficiently.
- **Role:** Panel nesting for CNC cut lists — pack rectangular parts onto standard sheets.

### Scientific Computing — SciPy (BSD-3)

- **GitHub:** https://github.com/scipy/scipy
- **Role:** Foundational algorithms for spatial calculations and engineering computations.

### LLM Agent replaces:

- **Problem formulation:** LLM agent translates business requirements into optimization problem definitions (replaces hand-coded formulation)
- **LP/MILP modeling:** OR-Tools handles this natively (replaces PuLP)
- **Irregular nesting orchestration:** LLM agent decides which parts need nesting, sets constraints (replaces libnest2d)

---

## MEP Engineering

> **Fully LLM-agent-driven** for residential scale. LLM agents perform all calculations using standard engineering formulas with proper citations.

### How it works:

1. LLM agent receives room specifications, design selections, and fixture schedules
2. Agent applies formulas from NEC (electrical), IPC/UPC (plumbing), and ASHRAE (HVAC) standards
3. Outlines guarantees structured output (panel schedules, pipe sizing tables, load calculations)
4. Agent shows its work — every calculation cites the source standard and clause number
5. Results are validated against known textbook values in unit tests

### Why specialized tools were removed:

- **EnergyPlus / OpenStudio** — designed for whole-building simulation of commercial structures. Overkill for residential room-scale MEP. Complex setup, slow execution, brittle configuration.
- **Ladybug Tools** — AGPL-3.0 license concern, plus LLM agents handle solar/thermal calculations from first principles.
- **EPpy / python-hvac** — thin wrappers around formulas that LLMs know natively.

### What the LLM agent computes:

- **Electrical:** Load calculation (W per circuit), wire gauge (NEC Table 310.16), voltage drop, panel schedule, conduit fill
- **Plumbing:** Fixture unit totals (IPC Table 604.4), pipe sizing, drainage slope, hot water system sizing
- **HVAC:** Cooling/heating load (ASHRAE Manual J simplified), equipment sizing (BTU/tonnage), duct sizing
- **Fire safety:** Smoke detector placement (NFPA 72), extinguisher locations
- **Validation:** Every calculation includes unit tests against textbook examples

---

## Infrastructure & Platform

### Workflow Engine — Temporal (MIT)

- **GitHub:** https://github.com/temporalio/temporal
- **Role:** Durable workflow orchestration for long-running project lifecycles (design → approval → procurement → construction). Handles retries, timeouts, and state persistence. Single choice — replaces Celery.

### Search — Meilisearch (MIT)

- **GitHub:** https://github.com/meilisearch/meilisearch
- **Role:** Product catalogue full-text search with instant results, faceted filtering, and typo tolerance.

### Vector Search — pgvector (PostgreSQL License)

- **GitHub:** https://github.com/pgvector/pgvector
- **Role:** Store and query CLIP/DINOv2 embeddings for visual product search, plus RAG retrieval for building codes and material specs — all within PostgreSQL.

### Object Storage — MinIO (AGPL-3.0)

- **GitHub:** https://github.com/minio/minio
- **Role:** Self-hosted S3-compatible file storage for photos, 3D models, renders, drawings, and documents.

### Real-time Collaboration — Y.js (MIT) + Socket.IO (MIT)

- **GitHub:** https://github.com/yjs/yjs / https://github.com/socketio/socket.io
- **Role:** CRDT-based collaborative design editing with WebSocket transport. Multiple users edit simultaneously with conflict-free merging.

### Event Streaming — NATS (Apache-2.0)

- **GitHub:** https://github.com/nats-io/nats-server
- **Role:** Inter-service event streaming — decouple microservices with publish/subscribe messaging.

---

## License Compatibility

| License | Commercial | Copyleft | Notes |
|---------|-----------|----------|-------|
| MIT | Yes | No | Most permissive |
| Apache-2.0 | Yes | No | Includes patent grant |
| BSD-3 | Yes | No | Permissive |
| LGPL-3.0 | Yes | Weak | Library use via dynamic linking OK |
| GPL-3.0 | Yes | Strong | Blender used as standalone service |
| AGPL-3.0 | Yes | Strong (network) | MinIO used as standalone infrastructure |

**OpenLintel is AGPL-3.0** — compatible with all licenses above. GPL/AGPL tools (Blender, MinIO) run as standalone services, not linked into application code.

---

## Tool Count

| Category | Specialized Tools | LLM Agent Handles |
|----------|------------------|-------------------|
| Computer Vision & 3D | 6 (SAM 2, Depth Anything, COLMAP, Open3D, GS, CLIP/DINOv2) | Object detection, floor plan parsing, scene understanding |
| CAD & Drawing | 2 (ezdxf, IfcOpenShell) | Parametric design, drawing specs, SVG generation |
| 3D Graphics | 4 (Three.js/R3F, Model Viewer, Blender, GaussianSplats3D) | Scene composition, camera placement |
| AI Generation | 5 (Diffusers, SDXL/FLUX, ControlNet, IP-Adapter, IC-Light) | Pipeline orchestration, prompt crafting, quality control |
| LLM & Agents | 4 (Ollama, vLLM, LangGraph, Outlines) | Everything listed above |
| Optimization | 4 (OR-Tools, DeepNest, rectpack, SciPy) | Problem formulation |
| MEP Engineering | 0 | All calculations via LLM agent |
| Infrastructure | 6 (Temporal, Meilisearch, pgvector, MinIO, Y.js/Socket.IO, NATS) | — |
| **Total** | **31 tools** | **12 service areas** |

*Previously 47 tools → now 31. The 16 removed tools are replaced by LLM agents that are more flexible, more maintainable, and better at reasoning.*

---

*This document is maintained alongside the codebase. When adding a new dependency, first ask: "Can an LLM agent do this?" If yes, use an agent. If no, add the specialized tool here.*
