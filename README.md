# SeaGrid AR

**Flutter mobile AR** app that overlays a metric 3D grid on the live camera for coastal navigation awareness: **elevation above sea level**, **mountain peak labels**, **coarse bathymetry** (planning-grade), and **tap-for-info** bubbles (name, depth/height, distance).

> **Not for certified navigation, life-critical diving decisions, or wreck-level precision.** Bathymetry is coarse (GEBCO-scale cells). Always use official charts and instruments.

## Status

Greenfield public design + monorepo scaffold. Full architecture and phased PR plan: [`docs/DESIGN.md`](docs/DESIGN.md).

| | |
|---|---|
| **License** | Apache-2.0 |
| **Client** | Flutter (iOS 16+, Android API 28+) |
| **AR** | Native scene: **RealityKit** (iOS) + **Filament / GLES** (Android) |
| **Tracking** | Platform VIO (ARKit / ARCore); SLAM stacks offline/import only |
| **Units** | Metric only |

## Features (product)

- Live camera + clean AR overlay (metric grid, true-north when moving)
- GPS + LiDAR (Tier A) + AR depth (Tier B) + GPS billboards (Tier C)
- Optimized VIO; optional later EKF fusion
- Height ≈ above sea level (orthometric display from ellipsoid − EGM96)
- Mountain peak labels (name + elevation)
- Underwater / bathymetric terrain mesh with **air-side occlusion** + water-plane clip
- Tap info bubble: name, depth/height, horizontal distance
- Purpose: fishing/diving **planning** depth context + surface travel distances

## Capability tiers

| Tier | Hardware | Experience |
|------|----------|------------|
| **A** | LiDAR / scene mesh (e.g. iPhone Pro) | Best mesh + air-side occlusion |
| **B** | AR depth API | Soft depth composite |
| **C** | GPS + IMU only | Grid + peak billboards, no hard occlusion |

## Architecture (summary)

- **Flutter** owns menus, settings, downloads, HUD chrome (Riverpod).
- **Native AR scene** owns camera, grid, bathy mesh, peak world nodes.
- **Live tracking:** ARKit / ARCore VIO — not full on-device ORB-SLAM3 / RTAB-Map / Cartographer.
- **SLAM stacks** (ORB-SLAM3, RTAB-Map, Cartographer): offline / edge **map import** post-v1.0.
- **Bathymetry:** GEBCO tile packs (SGB1: int16 + scale/offset); geographic EPSG:4326 tiles.
- **Peaks:** GeoNames + DEM enrichment offline packs.
- **Coords:** WGS84 storage; local ENU placement; explicit AR↔ENU geodetic anchor.

See design doc for normative algorithms, `MetricFormat`, mode matrix, and Android Filament annex.

## Repository layout

```
apps/seagrid/          # Flutter application (scaffold TBD — PR 1)
packages/              # Pure-Dart packages (geo, bathy, peaks, ar_interface, …)
native/                # iOS RealityKit / Android Filament shells
tools/                 # tile_builder, peak_builder
docs/DESIGN.md         # Full design + PR plan
```

## Implementation PR plan (ordered)

MVP (iOS Tier A/B): scaffold → domain/geo → tiers → AR shell → grid → geodetic anchor + elevation HUD → peaks → info bubbles.

Then bathymetry tiles → offline packs → mesh (requires anchor) → air-side occlusion → bathy hits → fusion polish → CDN → launch hardening. SLAM import is post-v1.0.

Full PR list with sizes and dependencies: **[docs/DESIGN.md § PR Plan](docs/DESIGN.md#pr-plan)**.

## Safety

Do not use SeaGrid AR as a substitute for:

- Official nautical charts or ECDIS  
- Dive computers / depth sounders  
- Certified altimetry or aviation use  

Open-water “occlusion” is **not** seafloor imaging through water — only air-side geometry and water-plane clipping.

## Contributing

1. Read `docs/DESIGN.md` (Key Decisions KD-1…22).  
2. Prefer small, reviewable PRs matching the plan.  
3. Keep metric units and uncertainty/resolution UX honest.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

Data sources (GEBCO, GeoNames, EGM96, etc.) retain their own terms; see design Appendix B.
