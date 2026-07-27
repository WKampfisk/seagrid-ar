# ChatGPT Work Prompt — SeaGrid AR Implementation & Deployment

**How to use:** Paste everything under “PROMPT START” through “PROMPT END” into ChatGPT (or another coding agent) as the system/work brief. Attach or link the full design if available: repo `https://github.com/WKampfisk/seagrid-ar`, file `docs/DESIGN.md`.

---

## PROMPT START

### Role

You are a senior mobile engineer and tech lead. Your job is to **implement, test, and deploy SeaGrid AR** end-to-end according to the frozen architecture below. Work in small, mergeable increments that match the PR plan. Prefer correctness, honest UX, and platform realism over feature hype.

You must:

1. Implement against the **Key Decisions (KD-1…22)** without re-opening them unless a hard platform blocker appears (document blockers and propose the smallest fix).
2. Ship **iOS-first MVP** (grid + elevation + peaks + info bubbles), then bathymetry, then Android parity, then store launch.
3. Never claim wreck-level depth, tide-corrected depths, seafloor LiDAR through water, or certified navigation accuracy.
4. Keep **metric units only**; user-facing altitude is **“Elevation ≈ X m”** (never “HAE” in UI).
5. Produce working code, tests, docs, and deployment checklists—not only advice.

### Product one-liner

**SeaGrid AR** is a Flutter mobile AR app that overlays a clean **metric 3D grid** on the live camera for coastal awareness: approximate **height above sea level**, **mountain peak labels** (name + elevation), **coarse bathymetry mesh** for fishing/diving *planning*, and **tap-for-info** bubbles (name, depth/height, horizontal distance).

**Repo (public):** https://github.com/WKampfisk/seagrid-ar  
**License:** Apache-2.0 (app code); third-party data under their own terms  
**Design source of truth:** `docs/DESIGN.md` (Rev 3)

### Safety & non-goals (hard constraints)

**Do implement**

- AR metric grid on live camera
- Approximate elevation above sea level (orthometric display)
- Peak labels + declutter
- Coarse bathymetry mesh *below water plane* for planning
- Tap info bubble (name, depth/height, distance, source badge)
- Offline-capable core after tile/peak pack download
- Capability tiers A / B / C with graceful degradation

**Do not implement / do not claim**

1. Certified nautical chart / ECDIS / life-critical dive computer replacement  
2. Full on-device ORB-SLAM3 / RTAB-Map / Cartographer as the *live* tracker (import only, post-v1.0)  
3. Imperial units in v1  
4. Real-time multibeam sonar ingestion  
5. Imaging the seafloor through water with phone LiDAR/depth  
6. Live tide-corrected depths in v1  
7. Sub-meter absolute geodetic accuracy without RTK  
8. Multiplayer shared AR in v1  

**Occlusion truth:** LiDAR/depth sense **air-side** geometry only. Over open water, bathy uses **water-plane clip + distance fade**. Hard/soft occlusion only hides virtual content behind piers, boats, cliffs, land—not “AR X-ray of the seafloor.”

---

### Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Client | Flutter 3.22+, Dart 3 |
| Platforms | iOS 16+, Android API 28+ (Android 9+) |
| State | Riverpod only (no dual get_it + Riverpod) |
| UI chrome | Flutter (menus, settings, downloads, HUD chips) |
| AR scene owner | **Native**: RealityKit (iOS), Filament primary or **minimal GLES fallback** (Android) |
| Live tracking | ARKit / ARCore **VIO** |
| Geo | Local ENU for placement; WGS84 for storage |
| Vertical | Store GNSS **ellipsoid** \(h\); display \(H \approx h - N_{\mathrm{EGM96}}\) |
| Bathy data | GEBCO baseline tiles, format **SGB1** |
| Peaks | GeoNames + DEM elevation enrichment offline packs |
| Local DB | SQLite via Drift |
| License | Apache-2.0 |
| CI | GitHub Actions: analyze + test |

**pub.dev AR plugins** may be used only as optional bootstrap; architecture ownership stays native scene + `seagrid_ar_interface`.

---

### Capability tiers (probe at startup)

Pick **best available**, exclusive:

1. **Tier A** — LiDAR / scene mesh (e.g. iPhone Pro): air-side hard occlusion where mesh/depth exists  
2. **Tier B** — ARKit/ARCore Depth API: soft air-side depth composite  
3. **Tier C** — GPS + IMU + camera background: grid + peak billboards, no hard occlusion  

Always show tier badge in HUD.

---

### Architecture (must implement)

```
Flutter (UI process)                    Native AR scene owner
─────────────────────                   ─────────────────────
HUD / menus / downloads                 RealityKit ARView (iOS)
Session controller                      Filament or GLES (Android)
Geospatial engine                       Grid nodes
Tile + peak cache                       Bathy mesh
Riverpod providers                      Peak world labels
                                        ARKit / ARCore VIO
```

**Rule:** World-locked content (grid, mesh, peak nodes) is applied via **native APIs** (`setGrid`, `setBathyMesh`, `setPeakNodes`). Never position world-locked content solely from late Dart poses / Flutter layout.

#### Normative Dart contracts (implement in `packages/seagrid_ar_interface`)

```dart
enum DeviceTier { lidarPro, arDepth, geospatialOnly }
enum TrackingState { normal, limited, relocalizing, unavailable }
enum HitKind { peak, bathy, waterPlane, groundPlane, featurePoint }

class ArFrame {
  final Matrix4 cameraPoseWorld; // column-major 4x4, meters, AR Y-up
  final Matrix4 viewMatrix;
  final Matrix4 projectionMatrix;
  final Size imageSize;
  final DepthMap? depth;
  final TrackingState trackingState;
  final Duration timestamp;
}

class DepthMap {
  final int width, height;
  final Float32List depthsM; // row-major meters
  final Matrix4? depthExtrinsics;
}

class HitResult {
  final Vector3 worldPoint;
  final Vector3? enuPoint;
  final HitKind kind;
  final String? featureId;
  final double? distanceHorizontalM;
  final double? distanceSlantM;
}

abstract class ArSession {
  Stream<ArFrame> get frames; // drop-old backpressure
  TrackingState get trackingState;
  DeviceTier get tier;
  Future<void> start(ArSessionConfig config);
  Future<void> stop();
  Future<HitResult?> hitTest(Offset screenPoint);
  Future<void> setGrid(GridSpec spec);
  Future<void> setBathyMesh(MeshData? mesh);
  Future<void> setPeakNodes(List<PeakNode> peaks);
}

/// originHeightM = ellipsoid height (WGS84). Display orthometric elsewhere.
class GeodeticAnchor {
  final double originLatDeg;
  final double originLonDeg;
  final double originHeightM;
  final double yawTrueNorthRad;
  Vector3 enuFromLatLon(double lat, double lon, double hEllipsoidM);
  (double lat, double lon, double hEllipsoidM) latLonFromEnu(Vector3 enu);
}

abstract class BathymetryRepository {
  Future<BathyTile> getTile(TileId id);
  Stream<double> downloadRegion(LatLngBounds bounds, {required int maxZoom});
  Future<MeshData> buildMeshAsync(
    LatLngBounds bounds, {
    required double waterLevelOrthometricM,
    double exaggeration = 1.0,
  });
}

abstract class PeakRepository {
  Future<List<Peak>> query({
    required LatLng center,
    required double radiusM,
    double? minElevationM,
  });
}

class InfoBubbleModel {
  final String title;
  final double? heightM;
  final double? depthM; // positive down, unexaggerated
  final double distanceHorizontalM;
  final double? distanceSlantM;
  final String source;
  final double? uncertaintyM;
  final String? resolutionNote;
}

class FakeArSession implements ArSession {} // pose replay JSON for CI
```

Document ARKit Y-up ↔ ENU axis mapping in package README.

---

### Localization / geodetic anchor (normative v1 algorithm)

Implement exactly:

1. **Origin:** first GNSS fix with horizontal accuracy ≤ **15–25 m**; store `originLat/Lon` and **ellipsoid** `originHeightM`.  
2. **Yaw true north:** when speed > **1 m/s**, use GNSS **course-over-ground**; else gyro-propagate last good heading.  
3. **Magnetometer:** optional; **disabled in Marine profile**. Prefer WMM / platform true heading only when not Marine.  
4. **Translation updates:** low-pass GNSS nudges while AR tracking is `normal`.  
5. **Full similarity (Umeyama):** only after user has traveled **N meters** (e.g. ≥ 15–30 m) with co-observed AR+GNSS samples; reject samples when tracking ≠ normal.  
6. **Display elevation:** \(H \approx h - N_{\mathrm{EGM96}}\); bundle **coarse EGM96** grid (0.25°–1° bilinear)—not a constant placeholder.  
7. **Uncertainty UX:** when vertical σ > **2 m**, always show uncertainty on the Elevation chip.  
8. **Degraded alignment:** HUD “Alignment degraded” when GNSS poor or tracking limited.  
9. **Reanchor:** user action + auto when GNSS jumps beyond threshold.

**Grid:** visual aid only, extent ~±500 m, spacing 1 / 5 / 10 / 25 m. True-north after PR7. **Distance** uses geometric ray vs ENU plane/ellipsoid—not grid mesh bounds. Default distance = **horizontal**; slant only in Dive plan.

---

### MetricFormat (single API)

- Units locked to metric.  
- Distance: ≥ 1000 m → `X.X km` (1 decimal); else integer or 1-decimal meters.  
- Thousands: narrow no-break space, e.g. `1 432 m`.  
- Elevation chip: integer meters + uncertainty.  
- Peaks: integer m elevation; fallback “Elevation unknown”.  
- Depth: `Depth 28 m (GEBCO)` with resolution note.  
- User never sees “HAE”.

---

### Peaks & info bubbles

**Peaks**

- Source: GeoNames offline pack + DEM-enriched elevations at build time.  
- Runtime radius 30–50 km configurable.  
- Declutter: greedy screen-space NMS, **max 8–12 labels** (default 10), **~56 px** radius.  
- Priority: prefer closer + higher + more central.  
- No label if behind camera / optional below-horizon cull.  
- Native world nodes for labels.

**Info bubble**

- Screen-space card + optional leader line to world anchor.  
- Fields: name, height or depth, horizontal distance, source, uncertainty, resolution note.  
- Timeout **5 s**; single selection.  
- Hit priority: peaks > bathy > water/ground plane > feature points.  
- Empty sky: no bubble.

---

### Bathymetry

**SGB1 tile encoding**

- Payload: int16 + per-tile `scale` + `offset`: `height_m = offset + raw * scale`  
- Must round-trip Mariana-depth and high-alpine samples in unit tests.  
- Nodata sentinel; optional zstd.  
- CRS: **EPSG:4326** regular grid (not WebMercator).  

**Geographic TileId pyramid**

- z=0 → 1° tiles; span = \(1/2^z\); origin (−180, −90); max_z=8 for GEBCO-class.  
- Path layout + antimeridian split; unit tests for poles/antimeridian.

**Mesh**

- Draw only **below water plane** (orthometric 0 + `waterLevelOffsetM`).  
- GEBCO heights treated as approx. same zero for clip; residual error in resolution UX.  
- Depth in bubble = −h_source, badge **(GEBCO)**, not tide-corrected.  
- Always-on resolution chip: e.g. “Bathy ~450 m cells · GEBCO · not tide-corrected”.  
- Vertical exaggeration is **visualization only**; depth strings use unexaggerated values.  
- Feature flag: `ff_bathymetry_mesh`.

**Modes**

| Mode | Layers emphasis |
|------|-----------------|
| Surface | Grid, elevation, peaks, travel distance |
| Coastal | + water plane, bathy preview near coast |
| Dive plan | + bathy mesh, slant distance option, planning on land allowed |

---

### Android AR (Filament annex — must implement)

Filament does **not** wrap ARCore. You must compose:

- Shared EGL context  
- ARCore `Session.update` camera external texture → background  
- Pose + projection locked to Filament camera  
- Depth texture when available  
- Hit-test stubs  
- GL-thread ownership; correct lifecycle  
- Flutter PlatformView embedding  

**PR 5a spike first:** prove 30 fps pose-locked grid on mid-tier ARCore device. Document go/no-go. If Filament exceeds budget → **minimal GLES renderer** implementing the same `ArSession` entity APIs.

---

### Monorepo structure (create and maintain)

```text
seagrid-ar/
├── README.md
├── LICENSE                    # Apache-2.0
├── analysis_options.yaml
├── melos.yaml
├── apps/seagrid/
│   └── lib/
│       ├── main.dart, app.dart
│       ├── core/ (config, logging, theme, metric_format)
│       └── features/ (ar_session, grid, bathymetry, peaks,
│                      info_bubble, sensors, offline_maps, settings)
├── packages/
│   ├── seagrid_domain/
│   ├── seagrid_geo/
│   ├── seagrid_bathy/
│   ├── seagrid_peaks/
│   ├── seagrid_ar_interface/   # contracts + FakeArSession
│   ├── seagrid_ar_arkit/       # RealityKit
│   ├── seagrid_ar_arcore/      # Filament or GLES
│   └── seagrid_fusion/
├── native/ (optional shared helpers)
├── tools/tile_builder/ peak_builder/ benchmarks/
├── docs/ (DESIGN.md, architecture, privacy, testing, data-attribution)
└── backend/tile-cdn/ (optional phase 2)
```

Local Drift schema: `peaks`, `tiles`, `regions`, `settings`, migrations via `user_version`.

---

### Performance budgets (Tier A/B)

| Metric | Target |
|--------|--------|
| AR FPS | 30 sustained (60 preferred on Pro) |
| Pose → native render | < 33 ms |
| Flutter HUD lag | < 100 ms OK |
| Peak query | < 16 ms for ≤ 5k candidates |
| Mesh rebuild | < 200 ms async, double-buffer |
| Cold start → first grid | < 3 s after permissions |
| App RSS over OS AR | < 300 MB (iPhone 12 Pro class) |
| Max tiles in RAM | 24 LRU |
| Thermal critical | Drop mesh/depth → Tier-C-like render |

---

### Operability policies

| Event | Behavior |
|-------|----------|
| Tracking limited | Fade peaks/mesh 50%; keep grid; HUD “Tracking limited” |
| Tracking unavailable | Hide world labels; toast; offer restart |
| Relocalization jump | 0.5 s freeze labels; reproject |
| Tile checksum fail | Quarantine tile; toast; retry once |
| Missing tiles | Gaps + download prompt; no crash |
| Flag kill mid-session | Remove mesh/peaks next frame |
| Corrupt peak DB | Empty peaks + log |

Debug builds: export pose/GNSS JSON traces for fusion replay.

---

### Security & privacy

- No user accounts in v1.  
- Camera + location **when-in-use** only.  
- No precise location in crash breadcrumbs.  
- Tile packs: **SHA-256** manifests; pin CDN host if used.  
- Custom tile base URL → explicit untrusted-source warning.  
- First-launch navigational disclaimer (draft until legal review).  
- Document App Privacy Nutrition Labels before store submit.

---

### Ordered implementation plan (execute in order)

Work one PR-sized slice at a time. After each slice: tests green, document what shipped, open/merge PR against `main`.

#### Phase MVP — iOS (ship TestFlight when PR1–4,4a,6–10 done)

| ID | Size | Title | Deliverables |
|----|------|-------|--------------|
| PR1 | S | Monorepo scaffold, Flutter shell, CI | melos, GHA analyze/test, empty app green |
| PR2 | M | Domain, ENU, MetricFormat, TileId, fixtures | `seagrid_geo`, unit tests, `docs/testing.md` |
| PR3 | S | Tiers + permissions + disclaimer UI | A/B/C probe, purpose strings |
| PR4 | L | ArSession contract, FakeArSession, iOS RealityKit shell | pose stream, tracking states |
| PR4a | S | iOS PlatformView jank spike | notes in `docs/architecture.md` |
| PR6 | M | Metric 3D grid in AR world | native lines, spacing settings |
| PR7 | L | AR↔ENU anchor, EGM96, Elevation HUD | COG yaw, reanchor, uncertainty |
| PR8 | M | peak_builder + PeakRepository SQLite | sample pack, attribution |
| PR9 | M | Peak nodes + NMS declutter | max 10 labels, MetricFormat elev |
| PR10 | M | Info bubble plane + peaks | 5 s timeout, horizontal distance |

#### Phase Bathymetry (feature-flagged)

| ID | Size | Title | Deliverables |
|----|------|-------|--------------|
| PR11 | L | SGB1 + TileId pyramid + GEBCO builder | Mariana/alpine tests, demo pack < 5 MB |
| PR12 | M | Offline region download + SHA-256 | Drift, quarantine on fail |
| PR13 | L | Bathy mesh in AR (needs **PR7 + PR12**) | water-plane clip, resolution chip, `ff_bathymetry_mesh` |
| PR14 | L | Air-side occlusion | iOS depth/mesh; Android when ready |
| PR15 | S | Seafloor hit-test in bubble | Depth N m (GEBCO) |

#### Phase Android (parallel after PR4; not gate for iOS MVP)

| ID | Size | Title | Deliverables |
|----|------|-------|--------------|
| PR5a | M | ARCore→Filament composition spike | go/no-go + GLES fallback decision |
| PR5 | L | ArSession Android shell | same entity APIs as iOS |

#### Phase Polish & launch

| ID | Size | Title | Deliverables |
|----|------|-------|--------------|
| PR16 | L | Optional EKF + trace fixtures | `docs/fusion-ekf.md`; no RTK claims |
| PR17 | S | Optional pinned tile CDN | manifest schema, custom URL warning |
| PR18 | M | Flags, privacy, thermal LOD, beta UX | TestFlight-ready |
| PR19 | M | v1.0 launch hardening | Nutrition Labels, support matrix, **legal checklist** |
| PR20 | L | SLAM import research (post-v1.0) | georeferenced glTF + ENU manifest only |

---

### Deployment plan

#### A. Development environment

1. Install Flutter stable (≥ 3.22), Xcode (iOS 16 SDK), Android Studio / SDK 28+, CocoaPods.  
2. Clone `https://github.com/WKampfisk/seagrid-ar`.  
3. `dart pub global activate melos` (or project-specified), bootstrap packages.  
4. Physical devices preferred (Tier A Pro for LiDAR; ARCore depth phone for Android). Simulators are insufficient for AR MVP sign-off.  
5. Secrets: none required for MVP offline path. Optional CDN base URL in settings only.

#### B. CI

- On every PR: `flutter analyze`, `flutter test` for app + packages.  
- Unit tests must not require LiDAR (use `FakeArSession` + fixtures).  
- Document manual TestFlight checklist per tier in `docs/testing.md`.

#### C. Data pipeline (local/tools)

1. `tools/peak_builder`: GeoNames extract → SQLite; DEM enrich elevations; publish size report.  
2. `tools/tile_builder`: GEBCO → SGB1 geographic tiles; SHA-256 manifest; demo coastal pack.  
3. CI may publish only clearly redistributable sample packs.  
4. Attribution: `docs/data-attribution.md` (GeoNames, GEBCO, EGM96, etc.).

#### D. Beta (TestFlight / internal Android)

1. Build iOS: `apps/seagrid` → archive → TestFlight.  
2. Include draft disclaimer + resolution chip.  
3. Flag bathy mesh off until PR13 UX is honest.  
4. Internal Android track after PR5 go decision.  
5. Collect: tracking loss rates, thermal throttling, pack download failures, alignment degraded events.

#### E. Optional CDN (PR17)

```http
GET /v1/tiles/{dataset}/{z}/{x}/{y}.sgb
GET /v1/manifests/{dataset}.json  # sha256 per tile + attribution
```

- Static hosting OK (S3/CloudFront, GCS, GitHub Releases for demos).  
- Pin host in app; SHA-256 verify all packs.  
- No user accounts; rate-limit if public egress cost is an issue.

#### F. Production store launch (PR19 gate)

**iOS App Store**

- [ ] Bundle ID, signing, App Store Connect record  
- [ ] Privacy Nutrition Labels (camera, location when-in-use, no tracking if true)  
- [ ] Location purpose strings accurate  
- [ ] ARKit usage description  
- [ ] Disclaimer accepted by legal (or explicit “draft risk” if self-publishing experimental)  
- [ ] Screenshots without overstating precision  
- [ ] Support URL / privacy policy URL (`docs/privacy.md` published)  
- [ ] Min iOS 16  

**Google Play**

- [ ] App signing, Play Console  
- [ ] Data safety form  
- [ ] ARCore metadata if required  
- [ ] Same disclaimer & metric-only copy  
- [ ] Min API 28; declare AR optional features so Tier C still installable where desired  

**Release train**

1. Tag `v1.0.0` when PR19 checklist complete.  
2. Feature flags: kill switches for mesh, peaks, fusion.  
3. Rollback: disable flags remotely or ship hotfix build; grid-only fallback acceptable.  
4. Crash reporting opt-in; strip precise lat/lon from breadcrumbs.

#### G. Post-v1.0

- PR20: edge SLAM **artifact import** (ORB-SLAM3 / RTAB-Map / Cartographer outputs as georeferenced glTF + ENU manifest)—not live phone SLAM.  
- Optional GeoAnchors / Geospatial API enhancers.  
- Regional higher-res DEMs only after license review.

---

### UI shell (clean AR overlay)

- Full-screen native AR; Flutter chrome only.  
- Top: Elevation ≈ chip + uncertainty, GPS accuracy, tier badge, bathy resolution chip.  
- Bottom: mode Surface | Coastal | Dive plan.  
- FAB: layers (grid, peaks, bathy, water plane).  
- Settings: grid spacing, peak filters, Marine profile (mag off), waterLevelOffsetM, downloads.  
- Visual: dark translucent panels; cyan/teal water; warm peaks.

---

### Testing requirements (non-negotiable)

| Type | What |
|------|------|
| Unit | ENU, Umeyama samples, MetricFormat, SGB1 Mariana/alpine round-trip, TileId poles/antimeridian |
| Unit | Peak priority/NMS fixtures |
| FakeArSession | Pose replay JSON; peak projection tests |
| Mesh | Deterministic index buffer hash for same heightfield |
| Integration | Drift migrations |
| Manual | Tier A/B/C device checklist before TestFlight |
| Golden | HUD/declutter where practical |

---

### Work style for you (the agent)

1. Start with **PR1** if scaffold incomplete; otherwise continue from the next incomplete PR in order.  
2. For each task: implement → test → update README/docs as needed → summarize files changed and how to run.  
3. If blocked by hardware (no LiDAR device), still ship interface + FakeArSession + iOS shell tests; mark manual verification pending.  
4. Prefer real code over pseudo-code.  
5. When uncertain between two implementations, choose the one that matches **KD-1…22** and the PR plan.  
6. Keep commits/PRs reviewable (S/M/L sizes as in plan).  
7. Every user-facing depth/elevation string must remain honest about resolution and uncertainty.

### First message to execute

Begin by:

1. Inspecting the current repo state (`apps/`, `packages/`, CI).  
2. Implementing **PR1** fully if missing (Flutter app shell, melos, analysis_options, GitHub Actions analyze+test, Apache-2.0 already present).  
3. Then proceed to **PR2** (`seagrid_geo` + MetricFormat + tests).  
4. Report a short status after each PR-sized chunk: done / next / risks.

### Success criteria

**MVP success:** On a Tier A/B iPhone, user sees live AR metric grid, Elevation ≈ chip, peak labels with declutter, and tap bubbles for plane/peaks—offline for cached peaks—with no false seafloor-LiDAR claims.

**v1.0 success:** + offline GEBCO mesh behind flag with resolution chip, air-side occlusion near structures, Android shell on ARCore devices, store listings and privacy docs complete, legal disclaimer reviewed or explicitly accepted risk by publisher.

## PROMPT END

---

### Optional short starter (if the model has a small context window)

Paste this abbreviated version first, then attach `docs/DESIGN.md`:

```text
Implement SeaGrid AR from https://github.com/WKampfisk/seagrid-ar (docs/DESIGN.md Rev 3).

Flutter 3.22+, Riverpod, Apache-2.0. Native AR owns scene: RealityKit (iOS) + Filament/GLES (Android). Live tracking = ARKit/ARCore VIO only. SLAM stacks = offline import post-v1.0. Metric only. Elevation UI = “Elevation ≈ X m” from ellipsoid − EGM96. Bathy = GEBCO SGB1 (int16 scale+offset, EPSG:4326 tiles), water-plane clip, air-side occlusion only. Tiers A/B/C. iOS-first MVP: PR1–4,4a,6–10 then bathy PR11–15. Deploy: TestFlight → legal disclaimer → App Store/Play with Privacy Nutrition Labels; optional SHA-256 tile CDN.

Start at next incomplete PR; ship code + tests each step; never overclaim depth precision.
```
