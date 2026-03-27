# OpenSim Workbench — User Guide

This guide walks you through every feature of OpenSim Workbench, from first launch to advanced design exploration and chip package analysis.

---

## Table of Contents

1. [Installation](#1-installation)
2. [First Launch](#2-first-launch)
3. [The Workbench Interface](#3-the-workbench-interface)
4. [Working with the Project Schematic](#4-working-with-the-project-schematic)
5. [Geometry](#5-geometry)
6. [Meshing](#6-meshing)
7. [Structural Analysis](#7-structural-analysis)
8. [Thermal Analysis](#8-thermal-analysis)
9. [Chip Package (DBA) Analysis](#9-chip-package-dba-analysis)
10. [Design Exploration](#10-design-exploration)
11. [Results Visualization](#11-results-visualization)
12. [CLI Usage](#12-cli-usage)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Installation

### Option A: Pre-built Binary

Download the latest release for your platform from the [Releases](https://github.com/anushree313/opensim-workbench-tauri/releases) page:

| Platform | File |
|---|---|
| Windows | `opensim-workbench_x.x.x_x64-setup.msi` |
| macOS (Intel) | `opensim-workbench_x.x.x_x64.dmg` |
| macOS (Apple Silicon) | `opensim-workbench_x.x.x_aarch64.dmg` |
| Linux (Debian/Ubuntu) | `opensim-workbench_x.x.x_amd64.deb` |
| Linux (AppImage) | `opensim-workbench_x.x.x_amd64.AppImage` |

### Option B: Build from Source

```bash
# Prerequisites: Rust 1.70+, Node.js 18+, Tauri CLI
git clone https://github.com/anushree313/opensim-workbench-tauri.git
cd opensim-workbench-tauri/app && npm install
cd ../src-tauri && cargo tauri build
```

### Option C: Development Mode (Browser Preview)

No Rust installation needed — the frontend runs standalone with mock data:

```bash
cd opensim-workbench-tauri/app
npm install
npm run dev
# Open http://localhost:5173 in your browser
```

---

## 2. First Launch

When you open OpenSim Workbench, you see the main workbench with a demo project pre-loaded. The demo project includes six systems in the schematic:

- **Geometry** — defines the 3D shape
- **Static Structural** — linear static FEA
- **Steady-State Thermal** — heat conduction solver
- **Mesh** — finite element mesh generator
- **DOE Study** — design of experiments
- **Chip Package (DBA)** — semiconductor die-bonding analysis

You can start using these immediately or create a new project via the **New** button in the toolbar.

---

## 3. The Workbench Interface

The interface has five main regions:

```
+------------------------------------------------------------------+
|  [Toolbar]  New | Save | Run All         Phase 1 - Schematic Only |
+--------+----------------------------------------+----------------+
|        |                                        |                |
|  Tool- |      Project Schematic                 |  Properties    |
|  box   |      (system cards + connections)      |  Panel         |
|        |                                        |                |
|        |                                        |                |
|        +----------------------------------------+                |
|        |      Messages                          |                |
+--------+----------------------------------------+----------------+
```

### Toolbar (Top)

| Button | Action |
|---|---|
| **New** | Create a new empty project |
| **Save** | Save the current project to disk (.osw file) |
| **Run All** | Execute all solvers in dependency order |

### Toolbox (Left Panel)

Lists all available system types organized into three categories:

**Analysis Systems** — physics solvers you can add to your project:
- Static Structural
- Modal
- Steady-State Thermal
- Fluid Flow
- Magnetostatic
- Chip Package (DBA)

**Component Systems** — shared building blocks:
- Geometry
- Engineering Data
- Mesh

**Design Exploration** — parametric studies:
- Design of Experiments
- Optimization

Click any item in the Toolbox to add it to the schematic.

### Schematic Canvas (Center)

The main workspace showing your project as a graph of connected systems. Each system appears as a card showing:

- **Title bar** — system name with colored header (green=component, blue=analysis, orange=DE)
- **Cells** — sub-steps within the system (Engineering Data, Geometry, Model, Setup, Solution, Results)
- **Status** — NOT CONFIGURED, CLEAN, DIRTY, SOLVING, SOLVED, or FAILED
- **Hint** — "Double-click to open"

**Interactions:**
- **Click** a card to select it (shows properties in the right panel)
- **Double-click** a card to open its dedicated viewer
- **Click X** on a card to remove it from the project
- **Drag** cards to rearrange the layout

**Connection lines** (dashed) show data flow between systems. These are created automatically when systems share geometry or mesh data.

### Properties Panel (Right)

Shows editable properties for the currently selected system. Content varies by system type:

- **Geometry**: body list, primitive parameters
- **Mesh**: element size, mesh statistics
- **Analysis**: boundary conditions, material selection, solver settings
- **DOE**: parameter ranges, sampling method

### Messages Panel (Bottom)

Displays log messages from the application:
- `[INFO]` — status updates, solver progress
- `[WARN]` — configuration warnings
- `[ERROR]` — solver failures, import errors

---

## 4. Working with the Project Schematic

### Adding Systems

1. Click a system type in the **Toolbox** (left panel)
2. The system card appears in the schematic
3. Connections to relevant existing systems are created automatically

### Removing Systems

Click the **X** button on any system card's title bar.

### System States

Each system progresses through states:

| State | Meaning | Visual |
|---|---|---|
| NOT CONFIGURED | System added but no data yet | Gray |
| CLEAN | Fully configured and up-to-date | Green |
| DIRTY | Upstream data changed, needs re-solve | Yellow |
| SOLVING | Solver currently running | Blue (animated) |
| SOLVED | Solution complete, results available | Green (bold) |
| FAILED | Solver encountered an error | Red |

**Dirty propagation**: When you modify geometry, all downstream systems (mesh, solvers, DE) automatically become DIRTY. This ensures you always know which results are out of date.

---

## 5. Geometry

### Opening the Geometry Viewer

Double-click the **Geometry** card in the schematic.

### The Geometry Viewer

The viewer shows a 3D canvas with a grid floor, ambient lighting, and orbit controls:

- **Left-click + drag** — rotate the view
- **Right-click + drag** — pan
- **Scroll wheel** — zoom in/out

### Adding Primitives

The toolbar across the top offers four primitive types:

| Primitive | Parameters |
|---|---|
| **Box** | Name, Origin (X,Y,Z), Size (W,H,D) |
| **Cylinder** | Name, Origin, Radius, Height, Segments |
| **Sphere** | Name, Origin, Radius, Segments |
| **Plate** | Name, Origin, Size (W,H), Thickness |

1. Click a primitive button (e.g., **Box**)
2. A dialog appears with default parameters
3. Edit the values as needed
4. Click **Create**
5. The primitive appears in the 3D viewport

### Importing Geometry

The Properties Panel (when a Geometry system is selected) includes an **Import** button supporting:
- **STL** files (stereolithography, binary or ASCII)
- **OBJ** files (Wavefront)

### Navigating the 3D Scene

All 3D viewers in the application share the same controls powered by React Three Fiber:

| Action | Control |
|---|---|
| Rotate | Left-click + drag |
| Pan | Right-click + drag |
| Zoom | Scroll wheel |
| Fit view | **Fit** button in toolbar |
| Reset view | Double-click empty area |

---

## 6. Meshing

### Opening the Mesh Viewer

Double-click the **Mesh** card in the schematic.

### Generating a Mesh

1. Ensure geometry is defined (the Mesh system must be connected to a Geometry system)
2. In the Properties Panel, set:
   - **Max Element Size** — controls mesh density (smaller = finer mesh, more elements)
   - **Element Type** — Tet4 (linear) or Tet10 (quadratic)
3. Click **Generate Mesh**

### Mesh Display

The mesh viewer shows:
- **Wireframe overlay** — element edges in white/gray
- **Surface shading** — element faces with lighting
- **Statistics** — node count, element count, quality metrics

### Quality Metrics

After meshing, the following quality indicators are computed per element:

| Metric | Ideal | Description |
|---|---|---|
| **Aspect Ratio** | 1.0 | Ratio of longest to shortest edge |
| **Skewness** | 0.0 | Deviation from ideal shape (0=perfect, 1=degenerate) |
| **Jacobian Ratio** | 1.0 | Element distortion measure |

---

## 7. Structural Analysis

### Setup

1. Double-click the **Static Structural** card
2. The viewer shows the mesh with a **Solve** button

### Boundary Conditions

In the Properties Panel, configure:

- **Fixed Support** — constrain nodes (zero displacement)
- **Displacement** — prescribed displacement at specific nodes
- **Force** — point or distributed forces (N)
- **Pressure** — surface pressure (Pa)
- **Body Temperature** — thermal loading for thermo-mechanical coupling

### Material Properties

Assign material from the built-in library:
- Steel (E=200 GPa, v=0.3)
- Aluminum (E=69 GPa, v=0.33)
- Copper (E=117 GPa, v=0.34)
- Silicon (E=130 GPa, v=0.28)

### Solving

Click **Solve** to run the linear static FEA solver. The system state changes to SOLVING, then SOLVED when complete.

### Understanding Results

The solver produces these result fields:

| Field | Unit | Description |
|---|---|---|
| **Displacement** | m | Vector field showing how much each node moved |
| **Strain** | — | Dimensionless deformation tensor |
| **Stress** | Pa | Cauchy stress tensor |
| **Von Mises Stress** | Pa | Scalar equivalent stress for yield comparison |

Results are displayed as pseudo-color maps on the 3D mesh with a color legend showing the value range.

---

## 8. Thermal Analysis

### Setup

1. Double-click the **Steady-State Thermal** card
2. Configure boundary conditions in the Properties Panel

### Boundary Conditions

| BC Type | Input | Description |
|---|---|---|
| **Fixed Temperature** | T (C) | Prescribed temperature at nodes |
| **Heat Flux** | q (W/m2) | Applied heat flux on surfaces |
| **Volumetric Source** | Q (W/m3) | Internal heat generation |
| **Convection** | h (W/m2K), T_inf (C) | Convective cooling on surfaces |

### Results

| Field | Unit | Description |
|---|---|---|
| **Temperature** | C | Scalar temperature at each node |
| **Heat Flux** | W/m2 | Vector field showing heat flow direction and magnitude |

---

## 9. Chip Package (DBA) Analysis

This is a specialized module for semiconductor packaging engineers evaluating die-bonding adhesive materials.

### Opening

Double-click the **Chip Package (DBA)** card in the schematic.

### Interface Layout

The chip package viewer has three panels:

```
+-----------------+-------------------+------------------+
| Parameters      | 3D Chip Assembly  | Comparison       |
| (editable)      | + Color Legend     | Radar Chart      |
|                 | + T-vs-Z Profile  | Material Table   |
+-----------------+-------------------+------------------+
```

### Geometry Parameters

Edit all nine dimensions of the 3-layer package:

| Layer | Parameter | Default |
|---|---|---|
| **Lead Frame** | Width, Height, Thickness | 10 x 10 x 0.25 mm |
| **DBA Layer** | Width, Height, Thickness | 4.2 x 4.2 x 0.025 mm |
| **Silicon Die** | Width, Height, Thickness | 4.1 x 4.1 x 0.3 mm |

### Analysis Types

Toggle between two modes using the toolbar buttons:

#### Thermal Analysis

**Inputs:**
- Heat Flux (W/m2) — power dissipation from the die (default: 50,000)
- Bottom Temperature (C) — lead frame bottom surface (default: 25)
- Convection coefficient h (W/m2K) — optional ambient cooling
- Ambient temperature T_inf (C) — for convection BC

**Outputs:**
- Temperature range at each interface (Leadframe, DBA, Die)
- Junction temperature T_junction (C)
- Thermal resistance R_theta_jc (K/W) — junction-to-case
- 3D thermal gradient visualization (rainbow: blue=cold, red=hot)
- Temperature-vs-Z profile plot

**Algorithm:** 1D Fourier's Law thermal resistance series:
```
R_total = R_die + R_dba + R_leadframe + R_spreading (Yovanovich)
T_junction = T_bottom + Q * R_total
```

#### Shear Analysis

**Inputs:**
- Shear Force (N) — applied lateral force (default: 10)
- Direction — X or Y axis

**Outputs:**
- Average shear stress (tau_avg) in Pa
- Maximum shear stress (tau_max) in Pa — with 1.5x stress concentration factor
- Von Mises equivalent stress (sigma_VM) in Pa
- Shear deformation (delta_shear) in m
- Total deformation including bending (delta_total) in m
- Bending stress (sigma_bend) in Pa
- Allowable shear stress (tau_allow) in Pa
- **Safety Factor** = tau_allow / tau_max

### Steady / Transient Toggle

- **Steady** — time-independent equilibrium solution (default)
- **Transient** — time-dependent analysis (future feature)

### DBA Material Selection

Choose from four built-in adhesive materials via the dropdown:

| Material | k (W/mK) | E (GPa) | CTE (ppm/K) | tau_allow (Pa) |
|---|---|---|---|---|
| **Epoxy DBA** | 1.5 | 2.5 | 65 | 1.5e7 |
| **Solder SAC305** | 58 | 50 | 23 | 3.0e7 |
| **Silver Sinter** | 240 | 9 | 19 | 5.0e7 |
| **Conductive Adhesive** | 3.5 | 3.2 | 40 | 2.0e7 |

Material properties are displayed in the left panel for reference.

### Running Analysis

1. Set your geometry, BCs, and material
2. Click **Run Analysis**
3. A solving spinner appears briefly
4. Results populate the left panel and 3D viewport updates with color mapping

### Comparing All Materials

Click **Compare All** to evaluate all four DBA materials against your current geometry and BCs. The right panel shows:

**Compare Tab:**
- **Comparison table** — T_junction, R_jc, tau_max, Safety Factor, Warpage for each material
- **Radar chart** — 5-axis spider plot normalizing thermal, mechanical, and warpage performance
- **Ranking badges** — materials ordered from best to worst overall

**Sweep Tab:** (parameter sweep results)

**Correlation Tab:** (experimental correlation — future feature)

### 3D View Controls

| Button | Action |
|---|---|
| **Explode** | Separate the 3 layers vertically for inspection |
| **Wire** | Toggle wireframe overlay on all layers |
| **Fit** | Reset camera to fit the package in view |

### Custom Materials

Click the **+** button next to "Custom Materials" to add your own DBA material with custom thermal conductivity, modulus, CTE, and allowable shear stress.

---

## 10. Design Exploration

### Design of Experiments (DOE)

1. Double-click the **DOE Study** card
2. Define input parameters with ranges (min, max, levels)
3. Choose sampling method:
   - **Full Factorial** — all combinations, thorough but exponential growth
   - **Latin Hypercube** — stratified random, good coverage with fewer points
   - **Central Composite** — augmented factorial for response surface fitting
4. Click **Run DOE**
5. Results show as a scatter plot of design points

### Response Surface

After running DOE:
1. Select output variable to model
2. Click **Fit Response Surface** — fits a quadratic polynomial surrogate
3. The R-squared goodness-of-fit score is displayed
4. Contour plot shows the predicted response across the parameter space

### Optimization

1. Define objective: minimize or maximize a response
2. Set parameter bounds
3. Click **Optimize** — runs Nelder-Mead simplex over the response surface
4. Optimal design point is highlighted

### Advanced: Pareto Frontier

For multi-objective optimization:
1. Define 2+ conflicting objectives
2. Click **Run Pareto** — uses genetic algorithm with non-dominated sorting
3. Pareto front displayed as a scatter plot of non-dominated solutions

### Advanced: Six Sigma

Monte Carlo-based process capability analysis:
1. Define parameter distributions (mean, std dev)
2. Set specification limits (LSL, USL)
3. Click **Run Six Sigma** — samples via LCG pseudo-random generator
4. Results: Cpk metric, histogram, % out-of-spec

---

## 11. Results Visualization

### Color Mapping

All result fields are displayed using a rainbow color scale:

```
Blue (min) --> Cyan --> Green --> Yellow --> Red (max)
```

The color legend on the right side of the viewport shows the numerical range.

### Viewing Options

| Feature | Description |
|---|---|
| **Field selector** | Choose which result field to display (displacement, stress, temperature, etc.) |
| **Component selector** | For vector/tensor fields: magnitude, X, Y, Z components |
| **Min/Max display** | Shows minimum and maximum values with locations |
| **Time step slider** | For transient results, scrub through time steps |
| **Deformation scale** | Amplify displacement visualization (structural only) |

---

## 12. CLI Usage

The CLI allows batch processing without the GUI:

```bash
# Create a new project
opensim new "Thermal Study" -o thermal.osw

# View project info
opensim info thermal.osw

# List all available system types
opensim list-systems
```

Output from `list-systems`:
```
Available system types:
  Analysis:
    - StaticStructural
    - Modal
    - SteadyThermal
    - TransientThermal
    - FluidFlow
    - Magnetostatic
    - Electrostatic
    - ChipPackageAnalysis
  Component:
    - Geometry
    - EngineeringData
    - Mesh
  DesignExploration:
    - DesignOfExperiments
    - Optimization
    - ResponseSurface
    - SixSigma
```

---

## 13. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New project |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo (when available) |
| `Delete` | Remove selected system |
| `Escape` | Return to schematic from viewer |
| `F` | Fit view to content |

---

## 14. Troubleshooting

### Blank 3D viewport

**Cause**: WebGL context not initialized.
**Fix**: Ensure hardware acceleration is enabled in your system settings. The Tauri app uses the system's GPU for 3D rendering.

### "NOT CONFIGURED" won't change

**Cause**: System has no upstream data.
**Fix**: Ensure the system is connected to a Geometry and/or Mesh system with data. A solver needs geometry + mesh + BCs + material to become CLEAN.

### Solver fails immediately

**Cause**: Missing boundary conditions or empty mesh.
**Fix**: Check that:
1. Geometry has at least one body
2. Mesh has been generated (node count > 0)
3. At least one BC is defined
4. Material is assigned

### Chip Package shows no results

**Cause**: Analysis not yet run.
**Fix**: Click **Run Analysis** after setting BCs. The "Parameters changed" indicator in the toolbar means results are stale.

### Mock data vs real solvers

When running in browser mode (`npm run dev`), all data is mock-generated. The solver algorithms only execute in the full Tauri desktop app (`cargo tauri dev`). The mock data demonstrates the UI and visualization but does not perform real calculations.

### Large mesh causes slowdown

**Cause**: LU decomposition is O(n^3) and not suited for very large problems.
**Fix**: Keep meshes under ~10,000 elements for interactive use. Future versions will add iterative solvers (CG, GMRES) for larger problems.

---

## Appendix A: Material Library

The built-in material library includes:

| Material | E (GPa) | v | rho (kg/m3) | k (W/mK) | CTE (ppm/K) |
|---|---|---|---|---|---|
| Structural Steel | 200 | 0.30 | 7850 | 50 | 12 |
| Aluminum 6061-T6 | 69 | 0.33 | 2700 | 167 | 23.6 |
| Copper C101 | 117 | 0.34 | 8960 | 385 | 17 |
| Silicon | 130 | 0.28 | 2330 | 130 | 2.6 |
| Water | — | — | 998 | 0.6 | — |
| Epoxy DBA | 2.5 | 0.35 | 1200 | 1.5 | 65 |
| Solder SAC305 | 50 | 0.35 | 7400 | 58 | 23 |
| Silver Sinter | 9 | 0.37 | 10500 | 240 | 19 |
| Conductive Adhesive | 3.2 | 0.35 | 1500 | 3.5 | 40 |

## Appendix B: Supported Element Types

| Element | Nodes | Order | Use |
|---|---|---|---|
| Line2 | 2 | Linear | Beam elements |
| Line3 | 3 | Quadratic | Higher-order beams |
| Tri3 | 3 | Linear | Surface mesh |
| Tri6 | 6 | Quadratic | Curved surfaces |
| Quad4 | 4 | Linear | Structured surface mesh |
| Quad8 | 8 | Quadratic | Curved structured mesh |
| **Tet4** | **4** | **Linear** | **Primary 3D element** |
| Tet10 | 10 | Quadratic | Higher-accuracy 3D |
| Hex8 | 8 | Linear | Structured 3D mesh |
| Hex20 | 20 | Quadratic | High-accuracy structured |
| Wedge6 | 6 | Linear | Transition elements |
| Pyramid5 | 5 | Linear | Hex-to-tet transition |

## Appendix C: File Formats

| Extension | Description |
|---|---|
| `.osw` | OpenSim Workbench project file (JSON) |
| `.stl` | Stereolithography geometry import (binary/ASCII) |
| `.obj` | Wavefront OBJ geometry import |
