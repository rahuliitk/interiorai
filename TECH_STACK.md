# OpenLintel Technology Stack

> Every open-source tool, library, and model that powers the OpenLintel platform — organized by capability area.

---

## Computer Vision & 3D Reconstruction

### Segmentation — SAM 2

- **GitHub:** https://github.com/facebookresearch/sam2
- **License:** Apache-2.0
- **Description:** Segment Anything Model 2 — state-of-the-art promptable segmentation for images and video.
- **Role in OpenLintel:** Room element segmentation (walls, floors, ceilings, doors, windows) from uploaded photos. Powers the room-segmentation ML pipeline.

### Object Detection — Grounding DINO

- **GitHub:** https://github.com/IDEA-Research/GroundingDINO
- **License:** Apache-2.0
- **Description:** Open-set object detection with text prompts — detect anything by describing it.
- **Role in OpenLintel:** Identify furniture, fixtures, appliances, and architectural elements in room photos without needing per-category training.

### Object Detection — YOLO (Ultralytics)

- **GitHub:** https://github.com/ultralytics/ultralytics
- **License:** AGPL-3.0
- **Description:** Real-time object detection, segmentation, and classification.
- **Role in OpenLintel:** Fast on-device detection for mobile AR measurement and real-time room scanning.

### Depth Estimation — Depth Anything V2

- **GitHub:** https://github.com/DepthAnything/Depth-Anything-V2
- **License:** Apache-2.0
- **Description:** State-of-the-art monocular depth estimation — infer 3D depth from a single photo.
- **Role in OpenLintel:** Estimate room dimensions from photos, generate depth maps for ControlNet-guided design generation, and support AR measurement calibration.

### Photogrammetry — COLMAP

- **GitHub:** https://github.com/colmap/colmap
- **License:** BSD-3-Clause
- **Description:** Structure-from-Motion and Multi-View Stereo photogrammetry pipeline.
- **Role in OpenLintel:** Reconstruct 3D room geometry from multiple photos. Core of the media-service photogrammetry pipeline.

### Photogrammetry — Meshroom (AliceVision)

- **GitHub:** https://github.com/alicevision/Meshroom
- **License:** MPL-2.0
- **Description:** Open-source 3D reconstruction pipeline with a node-based UI.
- **Role in OpenLintel:** Alternative photogrammetry backend for high-quality mesh reconstruction from photo sets.

### 3D Processing — Open3D

- **GitHub:** https://github.com/isl-org/Open3D
- **License:** MIT
- **Description:** Modern library for 3D data processing — point clouds, meshes, and scene reconstruction.
- **Role in OpenLintel:** Point cloud processing, mesh cleaning, and 3D model manipulation in the media-service pipeline.

### 3D Gaussian Splatting

- **GitHub:** https://github.com/graphdeco-inria/gaussian-splatting
- **License:** Custom (research, see repo)
- **Description:** Real-time radiance field rendering using 3D Gaussians.
- **Role in OpenLintel:** Generate photorealistic navigable 3D captures of rooms for immersive visualization and digital twins.

### SLAM — ORB-SLAM3

- **GitHub:** https://github.com/UZ-SLAMLab/ORB_SLAM3
- **License:** GPL-3.0
- **Description:** Visual-Inertial SLAM system for monocular, stereo, and RGB-D cameras.
- **Role in OpenLintel:** Real-time spatial mapping during mobile video walkthroughs for room capture.

### Floor Plan Parsing — CubiCasa5k

- **GitHub:** https://github.com/CubiCasa/CubiCasa5k
- **License:** Custom (research)
- **Description:** Large-scale floor plan image dataset and parsing model.
- **Role in OpenLintel:** Baseline model for the floor-plan-digitizer ML pipeline — convert raster floor plan images to structured room layouts.

### Floor Plan Parsing — RoomFormer

- **GitHub:** https://github.com/ywyue/RoomFormer
- **License:** MIT
- **Description:** Transformer-based floor plan reconstruction from point clouds.
- **Role in OpenLintel:** Convert 3D point cloud scans into structured floor plans with room polygons.

---

## CAD & Technical Drawing

### DXF I/O — ezdxf

- **GitHub:** https://github.com/mozman/ezdxf
- **License:** MIT
- **Description:** Python library for reading, writing, and modifying DXF files.
- **Role in OpenLintel:** Core library for the drawing-generator service — produces DXF floor plans, elevations, sections, and cut list layouts.

### BIM/IFC — IfcOpenShell

- **GitHub:** https://github.com/IfcOpenShell/IfcOpenShell
- **License:** LGPL-3.0
- **Description:** Open-source IFC (Industry Foundation Classes) library for BIM data.
- **Role in OpenLintel:** Import/export IFC files for interoperability with BIM tools (Revit, ArchiCAD). Structural and MEP data exchange.

### Parametric CAD — CadQuery / Build123d

- **GitHub:** https://github.com/CadQuery/cadquery / https://github.com/gumyr/build123d
- **License:** Apache-2.0
- **Description:** Python-based parametric CAD scripting built on OpenCASCADE.
- **Role in OpenLintel:** Generate parametric furniture models, joinery details, and custom millwork from design specifications.

### Geometry Kernel — OpenCASCADE (via pythonOCC)

- **GitHub:** https://github.com/tpaviot/pythonocc-core
- **License:** LGPL-3.0
- **Description:** Python wrapper for the OpenCASCADE geometry kernel — industrial-strength B-Rep modeling.
- **Role in OpenLintel:** Geometric operations for intersection detection, boolean operations on room geometry, and STEP/IGES file handling.

---

## 3D Graphics & Rendering

### Web 3D Engine — Three.js + React Three Fiber

- **GitHub:** https://github.com/mrdoob/three.js / https://github.com/pmndrs/react-three-fiber
- **License:** MIT
- **Description:** The most widely used WebGL library, with a React renderer for declarative 3D scenes.
- **Role in OpenLintel:** Core 3D engine for the web application — room visualization, design variant preview, interactive 3D editor, and AR viewer.

### AR/VR — A-Frame

- **GitHub:** https://github.com/aframevr/aframe
- **License:** MIT
- **Description:** Web framework for building VR/AR experiences using HTML-like components.
- **Role in OpenLintel:** WebXR-based AR preview of designs overlaid on real rooms via mobile browser.

### AR/VR — Google Model Viewer

- **GitHub:** https://github.com/google/model-viewer
- **License:** Apache-2.0
- **Description:** Web component for rendering 3D models with AR support.
- **Role in OpenLintel:** Quick AR preview of individual furniture and fixture items from the catalogue.

### PBR Rendering — Google Filament

- **GitHub:** https://github.com/google/filament
- **License:** Apache-2.0
- **Description:** Real-time physically-based rendering engine for mobile, web, and desktop.
- **Role in OpenLintel:** High-quality material preview rendering — accurate representation of tiles, wood grains, fabrics, and metal finishes.

### Offline Rendering — Blender Python API

- **GitHub:** https://github.com/blender/blender (via bpy module)
- **License:** GPL-3.0 (Cycles renderer: Apache-2.0)
- **Description:** Full 3D creation suite with Python scripting and production-quality Cycles renderer.
- **Role in OpenLintel:** Headless photorealistic rendering of design variants. Batch-render marketing images and client presentation renders.

### Gaussian Splat Viewer — GaussianSplats3D

- **GitHub:** https://github.com/mkkellogg/GaussianSplats3D
- **License:** MIT
- **Description:** Three.js-based viewer for 3D Gaussian Splat scenes.
- **Role in OpenLintel:** Web-based interactive viewer for Gaussian Splat room captures — navigable photorealistic room walkthroughs.

---

## AI Design Generation

### Diffusion Framework — Hugging Face Diffusers

- **GitHub:** https://github.com/huggingface/diffusers
- **License:** Apache-2.0
- **Description:** State-of-the-art diffusion model library — inference and training for image, video, and audio generation.
- **Role in OpenLintel:** Core framework for the design-engine service. Loads and runs all diffusion-based design generation models.

### Base Models — SDXL / FLUX.1-schnell

- **GitHub:** https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 / https://huggingface.co/black-forest-labs/FLUX.1-schnell
- **License:** Apache-2.0
- **Description:** High-quality text-to-image foundation models.
- **Role in OpenLintel:** Generate interior design concept images from text descriptions of style, materials, and spatial layout.

### Architectural Control — ControlNet

- **GitHub:** https://github.com/lllyasviel/ControlNet
- **License:** Apache-2.0
- **Description:** Add spatial conditioning controls (edges, depth, segmentation) to diffusion models.
- **Role in OpenLintel:** Constrain design generation to match actual room geometry — floor plan outlines, depth maps, and segmentation masks guide the output.

### Style Transfer — IP-Adapter

- **GitHub:** https://github.com/tencent-ailab/IP-Adapter
- **License:** Apache-2.0
- **Description:** Image Prompt Adapter for text-to-image diffusion models — transfer style from reference images.
- **Role in OpenLintel:** Allow users to upload mood board images or reference photos and generate designs that match the style/aesthetic.

### Relighting — IC-Light

- **GitHub:** https://github.com/lllyasviel/IC-Light
- **License:** Apache-2.0
- **Description:** Controllable image relighting with diffusion models.
- **Role in OpenLintel:** Adjust lighting in design renders to match time-of-day, window orientation, and artificial lighting design.

### Workflow Builder — ComfyUI

- **GitHub:** https://github.com/comfyanonymous/ComfyUI
- **License:** GPL-3.0
- **Description:** Node-based UI for building complex diffusion model workflows.
- **Role in OpenLintel:** Prototyping and chaining multi-step generation pipelines (e.g., segment → depth → generate → relight → upscale).

---

## LLM & AI Agents

### Local Model Serving — Ollama

- **GitHub:** https://github.com/ollama/ollama
- **License:** MIT
- **Description:** Run large language models locally with a simple API.
- **Role in OpenLintel:** Local LLM inference for development and self-hosted deployments — no cloud API dependency.

### Local Model Serving — vLLM

- **GitHub:** https://github.com/vllm-project/vllm
- **License:** Apache-2.0
- **Description:** High-throughput LLM serving engine with PagedAttention.
- **Role in OpenLintel:** Production-grade LLM serving for multi-user inference with optimal GPU utilization.

### Open Models — Qwen 2.5/3

- **GitHub:** https://github.com/QwenLM/Qwen2.5
- **License:** Apache-2.0
- **Description:** State-of-the-art open-weight LLM family from Alibaba.
- **Role in OpenLintel:** Primary open LLM for design copilot, material recommendations, building code Q&A, and project planning assistance.

### Open Models — Mistral

- **GitHub:** https://github.com/mistralai/mistral-inference
- **License:** Apache-2.0
- **Description:** Efficient open-weight LLMs.
- **Role in OpenLintel:** Alternative LLM backend for cost/performance trade-offs and multi-model routing.

### Agent Framework — LangGraph

- **GitHub:** https://github.com/langchain-ai/langgraph
- **License:** MIT
- **Description:** Framework for building stateful, multi-step LLM agent workflows as graphs.
- **Role in OpenLintel:** Orchestrate complex design-to-delivery workflows — multi-step reasoning chains for design generation, BOM calculation, and procurement planning.

### Multi-Agent — CrewAI

- **GitHub:** https://github.com/crewAIInc/crewAI
- **License:** MIT
- **Description:** Framework for orchestrating role-playing AI agents working together.
- **Role in OpenLintel:** Coordinate specialized agents (designer, engineer, estimator, procurement) for end-to-end project automation.

### RAG — LlamaIndex

- **GitHub:** https://github.com/run-llama/llama_index
- **License:** MIT
- **Description:** Data framework for connecting LLMs to external data sources.
- **Role in OpenLintel:** Retrieval-Augmented Generation over building codes, material specifications, product catalogues, and design guidelines.

### Structured Output — Outlines

- **GitHub:** https://github.com/dottxt-ai/outlines
- **License:** Apache-2.0
- **Description:** Guaranteed structured generation from LLMs — JSON, regex, grammars.
- **Role in OpenLintel:** Ensure LLM outputs conform to typed schemas (BOM items, room specifications, design parameters) for reliable downstream processing.

---

## Optimization

### General Optimization — Google OR-Tools

- **GitHub:** https://github.com/google/or-tools
- **License:** Apache-2.0
- **Description:** Operations research suite — constraint programming, linear/integer programming, routing, scheduling.
- **Role in OpenLintel:** Furniture layout optimization, procurement route planning, construction schedule optimization, and resource allocation.

### Sheet Nesting — DeepNest

- **GitHub:** https://github.com/Jack000/DeepNest
- **License:** MIT
- **Description:** Open-source 2D nesting / bin-packing optimizer for irregular shapes.
- **Role in OpenLintel:** Optimize tile and stone cutting layouts — minimize waste on irregularly shaped pieces.

### Sheet Nesting — libnest2d

- **GitHub:** https://github.com/tamasmeszaros/libnest2d
- **License:** LGPL-3.0
- **Description:** 2D irregular bin-packing library (C++ with Python bindings).
- **Role in OpenLintel:** High-performance nesting backend for the cutlist-engine — pack panel parts onto standard sheet sizes.

### Rectangle Packing — rectpack

- **GitHub:** https://github.com/secnot/rectpack
- **License:** Apache-2.0
- **Description:** Fast 2D rectangle bin-packing algorithms in Python.
- **Role in OpenLintel:** Rectangular panel nesting for CNC cut lists — fast optimization for standard rectangular parts.

### Linear Programming — PuLP

- **GitHub:** https://github.com/coin-or/pulp
- **License:** MIT (BSD-2)
- **Description:** LP/MILP modeler in Python.
- **Role in OpenLintel:** Formulate and solve material purchasing optimization, vendor selection, and budget allocation problems.

### Scientific Computing — SciPy

- **GitHub:** https://github.com/scipy/scipy
- **License:** BSD-3-Clause
- **Description:** Fundamental algorithms for scientific computing in Python.
- **Role in OpenLintel:** Optimization algorithms, spatial calculations, and engineering computations across all Python services.

---

## MEP Engineering

### Energy Modeling — EnergyPlus

- **GitHub:** https://github.com/NREL/EnergyPlus
- **License:** BSD-3-Clause
- **Description:** DOE's whole-building energy simulation engine.
- **Role in OpenLintel:** HVAC load calculations, energy performance modeling, and sustainability scoring for design variants.

### Energy Modeling — OpenStudio

- **GitHub:** https://github.com/NREL/OpenStudio
- **License:** BSD-3-Clause
- **Description:** Cross-platform collection of tools for building energy modeling using EnergyPlus.
- **Role in OpenLintel:** Building energy model creation and parametric analysis for comparing design variant energy performance.

### Python EnergyPlus — EPpy

- **GitHub:** https://github.com/santoshphilip/eppy
- **License:** MIT
- **Description:** Python scripting for EnergyPlus input/output files.
- **Role in OpenLintel:** Programmatically create and modify EnergyPlus models from design specifications in the mep-calculator service.

### HVAC Calculations — Ladybug Tools

- **GitHub:** https://github.com/ladybug-tools
- **License:** AGPL-3.0
- **Description:** Collection of tools for environmental design analysis — solar, daylight, thermal comfort, energy.
- **Role in OpenLintel:** Solar analysis, daylight simulation, thermal comfort evaluation, and environmental performance scoring.

### Python HVAC — python-hvac

- **Description:** Python utilities for HVAC engineering calculations.
- **Role in OpenLintel:** Psychrometric calculations, duct sizing, and equipment selection formulas in the mep-calculator service.

---

## Infrastructure & Platform

### Task Queue — Celery

- **GitHub:** https://github.com/celery/celery
- **License:** BSD-3-Clause
- **Description:** Distributed task queue for Python.
- **Role in OpenLintel:** Async job processing for ML inference, render generation, BOM calculation, and report generation.

### Workflow Engine — Temporal

- **GitHub:** https://github.com/temporalio/temporal
- **License:** MIT
- **Description:** Durable workflow execution platform.
- **Role in OpenLintel:** Orchestrate long-running project workflows (design → approval → procurement → construction) with reliable state management and retry logic.

### Search — Meilisearch

- **GitHub:** https://github.com/meilisearch/meilisearch
- **License:** MIT
- **Description:** Lightning-fast, typo-tolerant search engine.
- **Role in OpenLintel:** Product catalogue full-text search with instant results, faceted filtering, and typo tolerance.

### Vector Search — pgvector

- **GitHub:** https://github.com/pgvector/pgvector
- **License:** PostgreSQL License
- **Description:** Open-source vector similarity search for PostgreSQL.
- **Role in OpenLintel:** Store and query CLIP/DINOv2 embeddings for visual product search, design similarity, and RAG retrieval — all within the existing PostgreSQL database.

### Object Storage — MinIO

- **GitHub:** https://github.com/minio/minio
- **License:** AGPL-3.0
- **Description:** High-performance S3-compatible object storage.
- **Role in OpenLintel:** Self-hosted file storage for photos, 3D models, renders, drawings, and documents. S3-compatible API for cloud migration.

### Real-time Collaboration — Y.js

- **GitHub:** https://github.com/yjs/yjs
- **License:** MIT
- **Description:** CRDT-based framework for building collaborative applications.
- **Role in OpenLintel:** Real-time collaborative design editing — multiple users can modify the same design simultaneously with conflict-free merging.

### Real-time Communication — Socket.IO

- **GitHub:** https://github.com/socketio/socket.io
- **License:** MIT
- **Description:** Bidirectional event-based real-time communication.
- **Role in OpenLintel:** WebSocket transport for the collaboration service — real-time updates, notifications, and live cursor tracking.

### Event Streaming — NATS

- **GitHub:** https://github.com/nats-io/nats-server
- **License:** Apache-2.0
- **Description:** High-performance cloud-native messaging system.
- **Role in OpenLintel:** Inter-service event streaming — decouple microservices with publish/subscribe messaging for design events, status updates, and workflow triggers.

---

## License Compatibility Notes

| License | Commercial Use | Modification | Distribution | Patent Grant | Copyleft |
|---------|---------------|-------------|-------------|-------------|----------|
| MIT | Yes | Yes | Yes | No | No |
| Apache-2.0 | Yes | Yes | Yes | Yes | No |
| BSD-3 | Yes | Yes | Yes | No | No |
| LGPL-3.0 | Yes | Yes | Yes | No | Weak (library) |
| GPL-3.0 | Yes | Yes | Yes | No | Strong |
| AGPL-3.0 | Yes | Yes | Yes | No | Strong (network) |

**OpenLintel's approach:**
- Core platform code is **AGPL-3.0** — compatible with all licenses above
- GPL/AGPL tools (ComfyUI, YOLO, Blender, MinIO, Ladybug) are used as **standalone services** or **development tools**, not linked into permissively-licensed code
- LGPL libraries (IfcOpenShell, pythonOCC, libnest2d) are used via **dynamic linking** as permitted by LGPL

---

*This document is maintained alongside the codebase. When adding a new open-source dependency, update this file with the tool's details and role in OpenLintel.*
