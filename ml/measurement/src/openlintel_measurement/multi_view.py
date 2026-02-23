"""
Multi-view stereo measurement using COLMAP.

When multiple photographs of the same room are available, COLMAP's
structure-from-motion (SfM) and multi-view stereo (MVS) pipeline produces
a metric 3D reconstruction from which highly accurate measurements can
be extracted.

This module wraps pycolmap to provide:
1. Feature extraction and matching across images.
2. Sparse reconstruction (SfM).
3. Dense reconstruction (MVS).
4. Point-to-point 3D measurement.

COLMAP reference: https://colmap.github.io/
pycolmap: https://pypi.org/project/pycolmap/
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from openlintel_measurement.schemas import (
    CalibratedDimension,
    MeasurementConfidence,
)

logger = logging.getLogger(__name__)


class MultiViewReconstructor:
    """COLMAP-based multi-view stereo for precision room measurements.

    Parameters
    ----------
    workspace_dir:
        Directory for COLMAP workspace files.  If ``None``, a temporary
        directory is created and cleaned up on ``close()``.
    camera_model:
        COLMAP camera model (e.g. ``"SIMPLE_PINHOLE"``, ``"PINHOLE"``,
        ``"SIMPLE_RADIAL"``).
    quality:
        Reconstruction quality preset: ``"low"``, ``"medium"``, ``"high"``.
        Higher quality takes longer but produces denser point clouds.
    """

    def __init__(
        self,
        *,
        workspace_dir: str | Path | None = None,
        camera_model: str = "SIMPLE_RADIAL",
        quality: str = "medium",
    ) -> None:
        if workspace_dir is None:
            self._temp_dir = tempfile.mkdtemp(prefix="openlintel_colmap_")
            self._workspace = Path(self._temp_dir)
        else:
            self._temp_dir = None
            self._workspace = Path(workspace_dir)
            self._workspace.mkdir(parents=True, exist_ok=True)

        self._camera_model = camera_model
        self._quality = quality
        self._images_dir = self._workspace / "images"
        self._sparse_dir = self._workspace / "sparse"
        self._dense_dir = self._workspace / "dense"
        self._database_path = self._workspace / "database.db"

        self._images_dir.mkdir(parents=True, exist_ok=True)
        self._sparse_dir.mkdir(parents=True, exist_ok=True)
        self._dense_dir.mkdir(parents=True, exist_ok=True)

        self._reconstruction: Any | None = None
        self._point_cloud: np.ndarray | None = None

    def add_images(self, image_paths: list[str | Path]) -> int:
        """Copy images into the COLMAP workspace.

        Parameters
        ----------
        image_paths:
            List of paths to room photographs.

        Returns
        -------
        int
            Number of images added.
        """
        count = 0
        for path in image_paths:
            src = Path(path)
            if src.exists():
                dst = self._images_dir / src.name
                shutil.copy2(str(src), str(dst))
                count += 1
            else:
                logger.warning("Image not found: %s", src)

        logger.info("Added %d images to COLMAP workspace", count)
        return count

    def reconstruct(self) -> dict[str, Any]:
        """Run the full COLMAP SfM + MVS pipeline.

        Returns
        -------
        dict
            Reconstruction summary with keys: ``num_images``,
            ``num_points``, ``mean_reprojection_error``.
        """
        try:
            import pycolmap
        except ImportError:
            raise ImportError(
                "pycolmap is required for multi-view reconstruction. "
                "Install with: pip install pycolmap"
            ) from None

        logger.info("Starting COLMAP reconstruction: quality=%s", self._quality)

        # Step 1: Feature extraction
        logger.info("Step 1/4: Feature extraction")
        pycolmap.extract_features(
            database_path=str(self._database_path),
            image_path=str(self._images_dir),
            camera_model=self._camera_model,
        )

        # Step 2: Feature matching
        logger.info("Step 2/4: Feature matching")
        if self._quality == "low":
            pycolmap.match_sequential(database_path=str(self._database_path))
        else:
            pycolmap.match_exhaustive(database_path=str(self._database_path))

        # Step 3: Sparse reconstruction (SfM)
        logger.info("Step 3/4: Sparse reconstruction (SfM)")
        maps = pycolmap.incremental_mapping(
            database_path=str(self._database_path),
            image_path=str(self._images_dir),
            output_path=str(self._sparse_dir),
        )

        if not maps:
            raise RuntimeError("COLMAP SfM failed — could not reconstruct scene")

        # Use the largest reconstruction
        self._reconstruction = max(maps.values(), key=lambda r: r.num_points3D)

        # Extract point cloud
        points3d = self._reconstruction.points3D
        self._point_cloud = np.array([p.xyz for p in points3d.values()])

        summary = {
            "num_images": self._reconstruction.num_reg_images,
            "num_points": self._reconstruction.num_points3D,
            "mean_reprojection_error": float(
                self._reconstruction.compute_mean_reprojection_error()
            ),
        }

        logger.info(
            "SfM complete: %d images registered, %d 3D points, "
            "mean reprojection error: %.3f px",
            summary["num_images"],
            summary["num_points"],
            summary["mean_reprojection_error"],
        )

        # Step 4: Dense reconstruction (optional, quality-dependent)
        if self._quality == "high":
            logger.info("Step 4/4: Dense reconstruction (MVS)")
            try:
                pycolmap.undistort_images(
                    output_path=str(self._dense_dir),
                    input_path=str(self._sparse_dir / "0"),
                    image_path=str(self._images_dir),
                )
                pycolmap.patch_match_stereo(
                    workspace_path=str(self._dense_dir),
                )
                pycolmap.stereo_fusion(
                    workspace_path=str(self._dense_dir),
                    output_path=str(self._dense_dir / "fused.ply"),
                )
                logger.info("Dense reconstruction complete")
            except Exception as exc:
                logger.warning("Dense reconstruction failed: %s", exc)
        else:
            logger.info("Step 4/4: Dense reconstruction skipped (quality=%s)", self._quality)

        return summary

    def measure_3d_distance(
        self,
        point_a: tuple[float, float, float],
        point_b: tuple[float, float, float],
        *,
        label: str = "3d_measurement",
        scale_factor: float = 1.0,
    ) -> CalibratedDimension:
        """Measure the Euclidean distance between two 3D points.

        Parameters
        ----------
        point_a:
            ``(x, y, z)`` coordinates of the first point (in COLMAP units).
        point_b:
            ``(x, y, z)`` coordinates of the second point.
        label:
            Human-readable measurement label.
        scale_factor:
            Conversion factor from COLMAP units to millimetres.
            Must be determined by measuring a known reference in 3D space.

        Returns
        -------
        CalibratedDimension
            The metric distance.
        """
        a = np.array(point_a)
        b = np.array(point_b)
        distance = float(np.linalg.norm(a - b))
        distance_mm = distance * scale_factor

        return CalibratedDimension(
            label=label,
            value_mm=distance_mm,
            confidence=MeasurementConfidence.HIGH,
            uncertainty_mm=distance_mm * 0.02,  # 2% uncertainty for multi-view
            method="multi_view_stereo",
        )

    def calibrate_scale(
        self,
        point_a_3d: tuple[float, float, float],
        point_b_3d: tuple[float, float, float],
        known_distance_mm: float,
    ) -> float:
        """Determine the COLMAP-to-mm scale factor using a known distance.

        Parameters
        ----------
        point_a_3d:
            First 3D point on the reference object.
        point_b_3d:
            Second 3D point on the reference object.
        known_distance_mm:
            Known real-world distance in mm.

        Returns
        -------
        float
            Scale factor (mm per COLMAP unit).
        """
        a = np.array(point_a_3d)
        b = np.array(point_b_3d)
        colmap_dist = float(np.linalg.norm(a - b))

        if colmap_dist <= 0:
            raise ValueError("Reference points are coincident — cannot calibrate scale")

        scale = known_distance_mm / colmap_dist

        logger.info(
            "Multi-view scale calibrated: %.4f mm/unit "
            "(COLMAP dist=%.4f, known=%.1f mm)",
            scale,
            colmap_dist,
            known_distance_mm,
        )

        return scale

    def find_nearest_3d_point(
        self,
        image_x: int,
        image_y: int,
        image_name: str,
        *,
        max_distance_px: float = 20.0,
    ) -> tuple[float, float, float] | None:
        """Find the nearest reconstructed 3D point to an image coordinate.

        Parameters
        ----------
        image_x, image_y:
            Pixel coordinates in the image.
        image_name:
            Filename of the image.
        max_distance_px:
            Maximum pixel distance to search for a matching 3D point.

        Returns
        -------
        tuple or None
            ``(x, y, z)`` of the nearest 3D point, or ``None`` if no
            point is within ``max_distance_px``.
        """
        if self._reconstruction is None:
            raise RuntimeError("Must call reconstruct() before querying 3D points")

        # Find the image ID
        image_id = None
        for img_id, img in self._reconstruction.images.items():
            if img.name == image_name:
                image_id = img_id
                break

        if image_id is None:
            logger.warning("Image '%s' not found in reconstruction", image_name)
            return None

        image_obj = self._reconstruction.images[image_id]
        target = np.array([image_x, image_y], dtype=np.float64)

        best_dist = max_distance_px
        best_point: tuple[float, float, float] | None = None

        for point2d in image_obj.points2D:
            if point2d.point3D_id < 0:
                continue  # No 3D point associated

            dist = float(np.linalg.norm(np.array(point2d.xy) - target))
            if dist < best_dist:
                best_dist = dist
                p3d = self._reconstruction.points3D[point2d.point3D_id]
                best_point = tuple(float(v) for v in p3d.xyz)

        return best_point

    @property
    def point_cloud(self) -> np.ndarray | None:
        """The reconstructed 3D point cloud as an ``(N, 3)`` array."""
        return self._point_cloud

    @property
    def num_points(self) -> int:
        """Number of reconstructed 3D points."""
        return len(self._point_cloud) if self._point_cloud is not None else 0

    def close(self) -> None:
        """Clean up temporary workspace files."""
        if self._temp_dir is not None:
            shutil.rmtree(self._temp_dir, ignore_errors=True)
            logger.info("Cleaned up COLMAP workspace: %s", self._temp_dir)

    def __enter__(self) -> MultiViewReconstructor:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
