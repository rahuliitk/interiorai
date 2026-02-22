# Media Service

Photo, video, and 3D model processing pipeline for OpenLintel.

## Responsibilities

- Photo upload, validation, and optimization
- Video processing for SLAM-based spatial reconstruction
- LiDAR point cloud ingestion
- Photogrammetry pipeline (photos to 3D mesh)
- 3D model format conversion (OBJ, FBX, GLTF)
- Render generation dispatch
- CDN integration for asset delivery

## Open-Source Tools

| Tool | License | Role |
|------|---------|------|
| [COLMAP](https://github.com/colmap/colmap) | BSD-3 | Structure-from-Motion photogrammetry — photos to 3D |
| [Open3D](https://github.com/isl-org/Open3D) | MIT | Point cloud processing, mesh cleaning, model manipulation |
| [Gaussian Splatting](https://github.com/graphdeco-inria/gaussian-splatting) | Custom | Photorealistic 3D scene capture for room walkthroughs |
| [OpenCV](https://github.com/opencv/opencv) | Apache-2.0 | Image processing, validation, and feature extraction |
| [Meshroom](https://github.com/alicevision/Meshroom) | MPL-2.0 | Alternative photogrammetry backend for dense reconstruction |

## Status

Phase 1 — In Development
