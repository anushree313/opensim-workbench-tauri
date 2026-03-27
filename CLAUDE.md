# OpenSim Workbench - Architecture & Development Guide

## Project Identity
- **Working name**: opensim-workbench-tauri
- **Purpose**: Modular, Workbench-inspired simulation platform for FEA/CFD/EM
- **Stack**: Rust (backend) + Tauri 2 (desktop shell) + React/TypeScript (UI)
- **License**: MIT OR Apache-2.0

## Repository Structure

```
opensim-workbench-tauri/
├── Cargo.toml                    # Workspace root
├── CLAUDE.md                     # This file
├── crates/
│   ├── core-project/             # Project model, graph engine, persistence
│   ├── core-geometry/            # Geometry abstractions, primitives, topology
│   ├── core-mesh/                # Mesh data structures, element types
│   ├── core-materials/           # Material library, engineering properties
│   ├── core-post/                # Results model, field data, summaries
│   ├── core-parametric/          # DOE, parameters, design studies
│   ├── core-hpc/                 # Job scheduling, queue management
│   ├── core-multiphysics/        # Coupling framework between solvers
│   ├── core-scripting/           # Rhai scripting engine integration
│   ├── physics-structural/       # Structural FEA (static, modal)
│   ├── physics-thermal/          # Thermal analysis (steady, transient)
│   ├── physics-cfd/              # CFD (incompressible Navier-Stokes)
│   ├── physics-em/               # EM (magnetostatic, electrostatic)
│   ├── app-engine/               # High-level orchestration, DTOs, Tauri API
│   └── cli/                      # Headless CLI binary
├── src-tauri/                    # Tauri desktop shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs                # Tauri app initialization
│       └── commands.rs           # #[tauri::command] handlers
└── app/                          # React + Vite + TypeScript frontend
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types/project.ts      # TypeScript types mirroring Rust DTOs
        ├── stores/projectStore.ts
        ├── styles/global.css
        └── components/
            └── workbench/        # Main workbench UI components
```

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│              React UI (app/)                │
│  Toolbox | Schematic Canvas | Properties    │
├─────────────────────────────────────────────┤
│         Tauri Commands (src-tauri/)         │
│     #[tauri::command] → invoke()            │
├─────────────────────────────────────────────┤
│          App Engine (app-engine)            │
│   Orchestration, DTOs, project lifecycle    │
├─────────────────────────────────────────────┤
│              Core Crates                    │
│  core-project | core-geometry | core-mesh   │
│  core-materials | core-post | core-hpc      │
│  core-parametric | core-multiphysics        │
├─────────────────────────────────────────────┤
│            Physics Solvers                  │
│  physics-structural | physics-thermal       │
│  physics-cfd | physics-em                   │
└─────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Project Graph**: The project is modeled as a DAG of system nodes with
   typed edges (GeometryShare, MeshShare, ResultTransfer, etc.). Dirty state
   propagates downstream automatically.

2. **DTOs**: All Tauri command boundaries use serde-friendly DTO structs
   (in `app-engine/src/dto.rs`). The frontend TypeScript types mirror these.

3. **Node States**: NotConfigured → Clean → Dirty → Solving → Solved/Failed.
   The graph engine manages state transitions and dirty propagation.

4. **System Kinds**: Analysis (structural, thermal, CFD, EM), Component
   (geometry, mesh, engineering data), and Design Exploration (DOE,
   optimization, response surfaces).

## Development Commands

```bash
# Build all Rust crates (excluding Tauri for faster iteration)
cargo build --workspace --exclude opensim-workbench

# Run Rust tests
cargo test --workspace

# Build CLI
cargo build -p opensim-cli

# Run CLI
cargo run -p opensim-cli -- list-systems
cargo run -p opensim-cli -- new "My Project" -o project.osw

# Frontend (from app/ directory)
npm install
npm run dev

# Full Tauri dev (from root)
cd src-tauri && cargo tauri dev
```

## Implementation Phases

- **Phase 1** (current): Core project model, Tauri shell, minimal schematic UI
- **Phase 2**: Geometry import + primitives + 3D viewer scaffolding
- **Phase 3**: Mesh data model, simple mesher, mesh display
- **Phase 4**: Structural linear static solver, result visualization
- **Phase 5**: Parametric engine, Design Exploration UI
- **Phase 6+**: Additional physics, multiphysics, advanced DE, remote solving

## Conventions

- Rust: `cargo fmt` + `cargo clippy`; minimal `unsafe`
- TypeScript: strict mode; types mirror Rust DTOs
- All Tauri commands return `Result<T, String>` for error propagation
- UUIDs for all entity IDs (cross-language compatible)
- JSON for project persistence (`.osw` extension)
