# Media Service

Photo, video, and 3D model processing pipeline for OpenLintel.

## Responsibilities

- Photo upload, validation, and optimization
- Video processing for spatial reconstruction
- LiDAR point cloud ingestion
- Photogrammetry pipeline (photos to 3D mesh)
- 3D model format conversion (OBJ, FBX, GLTF)
- Render generation dispatch
- CDN integration for asset delivery

## Architecture: Specialized CV/3D Pipeline

The media service is the most tool-heavy service — 3D reconstruction and processing fundamentally require specialized models and geometry code.

### Specialized Tools

| Tool | License | Role |
|------|---------|------|
| [COLMAP](https://github.com/colmap/colmap) | BSD-3 | Structure-from-Motion — photos to 3D reconstruction |
| [Open3D](https://github.com/isl-org/Open3D) | MIT | Point cloud processing, mesh cleaning, model manipulation |
| [Gaussian Splatting](https://github.com/graphdeco-inria/gaussian-splatting) | Custom | Photorealistic 3D scene capture |
| [SAM 2](https://github.com/facebookresearch/sam2) | Apache-2.0 | Room element segmentation from photos |
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Apache-2.0 | Monocular depth estimation |
| [OpenCV](https://github.com/opencv/opencv) | Apache-2.0 | Image processing, validation, feature extraction |

### VLM/LLM Agent handles

- Object identification in room photos via VLM (replaces Grounding DINO)
- Scene understanding and metadata extraction
- Quality assessment of uploaded media

## Status

Phase 1 — In Development
