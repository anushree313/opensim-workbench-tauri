# OpenSim Workbench

**A modular, open-source CAE (Computer-Aided Engineering) simulation platform built with Rust and React.**

OpenSim Workbench brings Ansys Workbench-style multiphysics simulation to the desktop as a native application. It features a project graph engine, interactive 3D viewers, FEA solvers for structural and thermal analysis, a chip package DBA (Die-Bonding Adhesive) analyzer, parametric design exploration, and a headless CLI for batch processing.

---

## Key Features

| Domain | Capabilities |
|---|---|
| **Structural FEA** | Linear static analysis, Tet4 elements, Von Mises stress, displacement fields |
| **Thermal FEA** | Steady-state heat conduction, Tet4 thermal elements, temperature & heat flux fields |
| **Chip Package DBA** | Fourier thermal resistance, shear/bending analysis, CTE mismatch, 4-material comparison |
| **Geometry** | Box, Cylinder, Sphere, Plate primitives; STL/OBJ import; tessellation |
| **Meshing** | Surface mesh from tessellation, Tet4/Tet10 volume meshing, quality metrics |
| **Design Exploration** | Full Factorial / Latin Hypercube / Central Composite DOE, response surfaces, optimization |
| **Advanced DE** | Pareto frontier (multi-objective), genetic algorithm, Monte Carlo Six Sigma |
| **Multiphysics** | Thermal-structural coupling framework (one-way sequential, two-way iterative) |
| **HPC** | Async job queue with background thread execution |
| **Scripting** | Rhai scripting engine for custom workflows |
| **CLI** | Headless batch processing (`opensim new`, `opensim info`, `opensim list-systems`) |

---

## Architecture

### System Overview

```
+-----------------------------------------------------------+
|                    Desktop Application                     |
|  +-----------------------------------------------------+  |
|  |              React + TypeScript Frontend             |  |
|  |  Toolbox | Schematic Canvas | 3D Viewers | Properties|  |
|  |  React Three Fiber (Three.js) for 3D rendering      |  |
|  +-----------------------------------------------------+  |
|                          | invoke()                        |
|  +-----------------------------------------------------+  |
|  |              Tauri 2 IPC Bridge                      |  |
|  |           43 #[tauri::command] handlers              |  |
|  +-----------------------------------------------------+  |
|                          |                                 |
|  +-----------------------------------------------------+  |
|  |              App Engine (Orchestration)              |  |
|  |          DTOs, business logic, state mgmt            |  |
|  +-----------------------------------------------------+  |
|         |            |            |           |            |
|  +-----------+ +-----------+ +---------+ +----------+     |
|  |  Core     | |  Physics  | | Parametric| |   HPC   |     |
|  |  Project  | | Structural| |   DOE    | |  Jobs   |     |
|  |  Geometry | |  Thermal  | | Optimizer| |  Queue  |     |
|  |  Mesh     | |  CFD (fw) | | Six Sigma| |         |     |
|  |  Materials| |  EM  (fw) | | Response | |         |     |
|  |  Post     | |           | | Surface  | |         |     |
|  +-----------+ +-----------+ +---------+ +----------+     |
+-----------------------------------------------------------+
```

### Rust Workspace (15 Crates)

```
crates/
  core-project/       Project model, DAG graph engine, JSON persistence
  core-geometry/      Geometry primitives, tessellation, STL/OBJ import
  core-mesh/          FE mesh structures, Tet4/Tet10 mesher, quality metrics
  core-materials/     Material library (9 built-in: Steel, Al, Cu, Si, epoxies...)
  core-post/          Result fields (scalar, vector, tensor), time steps
  core-parametric/    DOE, response surfaces, optimization, Six Sigma
  core-hpc/           Async job queue, background execution
  core-multiphysics/  Coupling framework between solvers
  core-scripting/     Rhai scripting integration
  physics-structural/ Tet4 FEA: stiffness assembly, LU solve, stress recovery
  physics-thermal/    Tet4 thermal: conductivity assembly, heat flux computation
  physics-cfd/        CFD framework (Navier-Stokes, solver kernel planned)
  physics-em/         EM framework (magnetostatic/electrostatic, planned)
  app-engine/         Orchestration layer, DTO mapping, Tauri command backing
  cli/                Headless CLI binary (clap-based)
```

### Frontend (React + TypeScript + Three.js)

```
app/src/
  components/
    workbench/
      Workbench.tsx         Main layout: toolbar + toolbox + canvas + properties
      SchematicCanvas.tsx   DAG visualization with draggable system cards
      SystemCard.tsx        Individual system node (state indicator, cells)
      Toolbox.tsx           Available systems grouped by category
      PropertiesPanel.tsx   Context-sensitive property editor
      MessagesPanel.tsx     Log output and solver messages
      Toolbar.tsx           New / Save / Run All actions
    viewer/
      GeometryViewer.tsx    3D primitive rendering with orbit controls
      MeshViewer.tsx        FE mesh wireframe + surface display
      ResultViewer.tsx      Pseudo-color field visualization
      DEViewer.tsx          DOE scatter plots, response surfaces, Pareto fronts
      ChipPackageViewer.tsx Full chip DBA simulator (thermal/shear/compare)
  stores/
    projectStore.ts         React hook state management + Tauri IPC bridge
  utils/
    chipCalculations.ts     Analytical engine for chip package analysis
  types/
    project.ts              TypeScript types mirroring Rust DTOs
```

### Project Graph Model

The project is modeled as a **directed acyclic graph (DAG)** where nodes represent analysis or component systems and edges represent data flow:

```
[Geometry] --GeometryShare--> [Static Structural]
    |                              |
    +--GeometryShare--> [Mesh] ---MeshShare---> [Steady-State Thermal]
                                   |
                          ResultTransfer
                                   v
                         [DOE Study] --ParameterLink--> [Optimization]
```

**Node States**: `NotConfigured` -> `Clean` -> `Dirty` -> `Solving` -> `Solved` / `Failed`

Dirty state propagates downstream automatically. Changing geometry marks all connected meshes and solvers as dirty.

---

## Solver Algorithms

### Structural FEA (Linear Static)

The structural solver uses **Tet4 (4-node linear tetrahedral)** elements:

1. **Element stiffness**: `K_e = V * B^T * D * B` where B is the strain-displacement matrix and D is the elasticity matrix
2. **Global assembly**: Scatter element matrices into global `K` and load vector `F`
3. **Boundary conditions**: Penalty method (penalty = 1e30) for prescribed displacements
4. **Solver**: LU decomposition via `nalgebra` — solves `K * u = F`
5. **Post-processing**: Strain `e = B * u_e`, Stress `s = D * e`, Von Mises `s_vm = sqrt(s1^2 - s1*s2 + s2^2 + 3*t^2)`

### Thermal FEA (Steady-State)

The thermal solver uses the same Tet4 element topology:

1. **Element conductivity**: `K_e = k * V * G^T * G` where G is the temperature gradient matrix
2. **Heat load vector**: Assembled from heat flux, volumetric sources, and convection BCs
3. **Temperature BCs**: Penalty method for prescribed temperatures
4. **Solver**: LU decomposition — solves `K * T = Q`
5. **Heat flux**: `q = -k * G * T_e` at each element centroid

### Chip Package DBA Analysis

Specialized analytical engine for semiconductor die-bonding adhesive evaluation:

- **Thermal**: 1D Fourier's Law resistance model with Yovanovich spreading resistance for area mismatch
- **Shear**: Average/maximum shear stress, Von Mises equivalent, shear + bending deformation
- **CTE Mismatch**: Stoney warpage formula for bi-material thermal strain
- **Materials**: Epoxy DBA, Solder SAC305, Silver Sinter, Conductive Adhesive
- **Comparison**: Runs all analyses across 4 materials with radar chart and ranking

### Design Exploration

- **DOE**: Full Factorial (n^k points), Latin Hypercube (stratified random), Central Composite (axial + factorial)
- **Response Surface**: Quadratic polynomial surrogate fitted via least-squares normal equations
- **Optimization**: Nelder-Mead simplex (gradient-free) over response surface or direct solver
- **Pareto Frontier**: Non-dominated sort for multi-objective optimization
- **Genetic Algorithm**: Population-based optimizer with tournament selection, crossover, mutation
- **Six Sigma**: Monte Carlo sampling with LCG PRNG, Cpk process capability metrics

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend** | Rust | 2021 edition |
| **Desktop Shell** | Tauri | 2.x |
| **Frontend** | React + TypeScript | React 19, TS 5.6 |
| **3D Rendering** | Three.js via React Three Fiber | Three 0.183, R3F 9.5 |
| **Linear Algebra** | nalgebra + nalgebra-sparse | — |
| **Build** | Cargo (Rust) + Vite (frontend) | — |
| **CLI Parsing** | clap | 4.x |
| **Scripting** | Rhai | — |
| **Serialization** | serde + serde_json | — |
| **Geometry Import** | stl_io, tobj (OBJ) | — |

---

## Getting Started

### Prerequisites

- **Rust** (1.70+): [rustup.rs](https://rustup.rs)
- **Node.js** (18+): [nodejs.org](https://nodejs.org)
- **Tauri CLI**: `cargo install tauri-cli`

### Quick Start (Frontend Dev Mode)

```bash
# Clone the repository
git clone https://github.com/anushree313/opensim-workbench-tauri.git
cd opensim-workbench-tauri

# Install frontend dependencies
cd app
npm install

# Start Vite dev server (runs with mock data, no Rust backend needed)
npm run dev
# Open http://localhost:5173
```

### Full Desktop App (Tauri)

```bash
# From repository root
cd src-tauri
cargo tauri dev
```

This starts both the Vite dev server and the Rust backend, opening the native desktop window.

### Production Build

```bash
# Build frontend
cd app && npm run build

# Build Tauri application
cd ../src-tauri && cargo tauri build
```

### Headless CLI

```bash
# Build CLI
cargo build -p opensim-cli

# List available system types
cargo run -p opensim-cli -- list-systems

# Create a new project
cargo run -p opensim-cli -- new "My Analysis" -o my_project.osw

# Inspect a project
cargo run -p opensim-cli -- info my_project.osw
```

### Build Rust Workspace Only

```bash
# Build all crates (excluding Tauri shell for faster iteration)
cargo build --workspace --exclude opensim-workbench

# Run all tests
cargo test --workspace
```

---

## Project Workflow

A typical simulation workflow in OpenSim Workbench follows this pattern:

```
1. Create Project     -->  New project with empty schematic
2. Add Systems        -->  Drag from Toolbox: Geometry + Analysis + Mesh
3. Connect Systems    -->  Link geometry to mesh to solver (auto-connected on add)
4. Define Geometry    -->  Add primitives or import STL/OBJ
5. Generate Mesh      -->  Configure element size, generate Tet4 mesh
6. Set Up Analysis    -->  Define boundary conditions and materials
7. Solve              -->  Run solver (structural, thermal, or chip package)
8. View Results       -->  3D pseudo-color visualization of fields
9. Design Exploration -->  Run DOE, fit response surface, optimize
```

### Chip Package DBA Workflow

```
1. Double-click "Chip Package (DBA)" in schematic
2. Edit geometry: lead frame (10x10mm), DBA (4.2x4.2mm), die (4.1x4.1mm)
3. Select analysis type: Thermal or Shear
4. Set boundary conditions (heat flux, temperature, or force)
5. Choose DBA material (Epoxy, Solder, Silver Sinter, Conductive Adhesive)
6. Click "Run Analysis" for single-material results
7. Click "Compare All" for 4-material comparison with radar chart
8. Use Explode/Wireframe to inspect 3D layer assembly
```

---

## Repository Structure

```
opensim-workbench-tauri/
  Cargo.toml              Rust workspace manifest
  CLAUDE.md               AI assistant context file
  README.md               This file
  USER_GUIDE.md           Detailed user guide
  .gitignore
  crates/                 15 Rust library crates (see Architecture above)
  src-tauri/              Tauri 2 desktop shell
    Cargo.toml
    tauri.conf.json       Window config (1400x900), dev server, plugins
    src/
      main.rs             Entry point
      lib.rs              App initialization + state management
      commands.rs          43 Tauri command handlers
  app/                    React + Vite + TypeScript frontend
    package.json
    vite.config.ts
    index.html
    src/                  (see Frontend section above)
```

---

## Design Decisions

1. **Rust + Tauri over Electron**: Native performance for numerical solvers, ~10x smaller binary, no bundled Chromium
2. **Workspace monorepo**: Each physics domain is its own crate — independent compilation, testing, and future plugin extraction
3. **DAG project graph**: Enables automatic dirty propagation, flexible workflow composition, and serializable project state
4. **Penalty BCs over matrix reduction**: Simpler implementation, preserves matrix dimensions, numerically stable with 1e30 penalty
5. **LU over iterative solvers**: Correct for small-to-medium problems; future work can add CG/GMRES for large meshes
6. **React Three Fiber over raw WebGL**: Declarative 3D components that integrate with React state management
7. **Mock data in browser mode**: Frontend runs standalone (no Rust backend) for rapid UI development
8. **DTO boundary at Tauri IPC**: Clean separation — Rust internal types never leak to frontend; DTOs are flat and serializable

---

## Roadmap

- [ ] FEM-based chip package solver (replace 1D analytical with 2D/3D elements)
- [ ] Transient thermal analysis (time-stepping)
- [ ] Material CRUD UI (add/edit/delete custom materials)
- [ ] Experimental correlation panel (simulation vs. measured data)
- [ ] Batch parameter sweep
- [ ] Result export (CSV for nodal/element data)
- [ ] Scenario save/load (project versioning)
- [ ] CFD solver kernel (incompressible Navier-Stokes)
- [ ] EM solver kernel (magnetostatic Poisson equation)
- [ ] Remote HPC job submission (SSH/REST)
- [ ] Plugin system for third-party solver integration

---

## License

This project is dual-licensed under MIT OR Apache-2.0.

---

## Acknowledgments

Built with [Tauri](https://tauri.app), [React Three Fiber](https://docs.pmnd.rs/react-three-fiber), [nalgebra](https://nalgebra.org), and [Rhai](https://rhai.rs).
