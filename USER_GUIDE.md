# OpenSim Workbench — User Guide

This guide walks you through every feature of OpenSim Workbench, from first launch to advanced design exploration and chip package analysis.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Installation](#2-installation)
3. [First Launch](#3-first-launch)
4. [The Workbench Interface](#4-the-workbench-interface)
5. [Working with the Project Schematic](#5-working-with-the-project-schematic)
6. [Geometry](#6-geometry)
7. [Meshing](#7-meshing)
8. [Structural Analysis](#8-structural-analysis)
9. [Thermal Analysis](#9-thermal-analysis)
10. [Chip Package (DBA) Analysis](#10-chip-package-dba-analysis)
11. [Test Bed Configuration](#11-test-bed-configuration)
12. [AI Chat Assistant](#12-ai-chat-assistant)
13. [Simulation History & Recording](#13-simulation-history--recording)
14. [Report Generation](#14-report-generation)
15. [Design Exploration](#15-design-exploration)
16. [Results Visualization](#16-results-visualization)
17. [Saving and Opening Projects](#17-saving-and-opening-projects)
18. [CLI Usage](#18-cli-usage)
19. [Keyboard Shortcuts](#19-keyboard-shortcuts)
20. [Chip Test Library](#20-chip-test-library)
21. [Material Manager](#21-material-manager)
22. [CSV Export](#22-csv-export)
23. [Scenario Manager](#23-scenario-manager)
24. [Solver Plugin System](#24-solver-plugin-system)
25. [Chip Deformation Analysis](#25-chip-deformation-analysis)
26. [Troubleshooting](#26-troubleshooting)

---

## 1. System Requirements

### Minimum Requirements

| Component | Windows | macOS | Linux |
|---|---|---|---|
| **OS** | Windows 10 (64-bit) 21H2+ | macOS 10.15 Catalina+ | Ubuntu 22.04+ or equivalent |
| **CPU** | 2-core x86_64, 2.0 GHz | Apple Silicon (M1+) or Intel | x86_64, 2.0 GHz |
| **RAM** | 4 GB | 4 GB | 4 GB |
| **Disk** | 200 MB (app) + 1 GB (projects) | 200 MB (app) + 1 GB (projects) | 200 MB (app) + 1 GB (projects) |
| **GPU** | DirectX 11 compatible | Metal compatible | OpenGL 3.3+ / Vulkan |
| **Display** | 1280 x 800 | 1280 x 800 | 1280 x 800 |

### Recommended Requirements

| Component | Specification |
|---|---|
| **CPU** | 4+ cores, 3.0 GHz+ |
| **RAM** | 8 GB+ (16 GB for large meshes) |
| **GPU** | Dedicated GPU with 2+ GB VRAM for smooth 3D rendering |
| **Display** | 1920 x 1080 or higher |
| **Disk** | SSD recommended for faster project load/save |

### Runtime Dependencies

| Platform | Dependency | Notes |
|---|---|---|
| **Windows** | WebView2 Runtime | Included in Windows 10 21H2+. Older versions: [download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| **Linux** | libwebkit2gtk-4.1 | `sudo apt install libwebkit2gtk-4.1-0` |
| **Linux** | libappindicator3 | `sudo apt install libappindicator3-1` |
| **macOS** | None | WebKit is built into macOS |

### For Building from Source

| Tool | Version |
|---|---|
| Rust | 1.70+ (via [rustup.rs](https://rustup.rs)) |
| Node.js | 18+ (via [nodejs.org](https://nodejs.org)) |
| Tauri CLI | `cargo install tauri-cli` |
| npm | 9+ (included with Node.js) |

---

## 2. Installation

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

## 5. Working with the Project Schematic

### Adding Systems (Drag & Drop)

**Method 1 — Drag and Drop** (recommended):
1. Grab a system type from the **Toolbox** (left panel)
2. Drag it onto the schematic canvas
3. Drop at the desired position
4. The system card appears at the drop location

**Method 2 — Click to Add:**
1. Click a system type in the **Toolbox**
2. The card appears at an auto-calculated grid position

### Moving Cards

Drag any card by its **header bar** to reposition it on the canvas. Connection lines follow the card as you drag.

### Connecting Systems

1. Hover over a system card to reveal the **connection ports** (small circles on card edges)
2. Click the **output port** (right edge) of the source system
3. A rubber-band line follows your mouse
4. Click the **input port** (left edge) of the target system
5. The connection is created automatically with the appropriate type (GeometryShare, MeshShare, etc.)
6. Press **Escape** to cancel a connection in progress

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

## 11. Test Bed Configuration

The Test Bed panel provides pre-defined industry-standard test configurations for each analysis type. Access it via the **Test Bed** button in any viewer's toolbar.

### Environment Conditions

| Parameter | Description | Default |
|---|---|---|
| Ambient Temperature | Background temperature | 25 C |
| Mounting | Free / Fixed-Base / Clamped-All | Free |
| Convection | Natural / Forced (with velocity) | Natural |

### Load Scenario Presets

**Chip Package (DBA):**
- JEDEC Thermal Cycling: -40C to 125C, 10 C/min ramp, 15 min dwell
- IPC Shear Test: 10 N force, 0.5 mm/min rate
- Power Cycling: 60s on/off, 5 W power

**Structural:**
- Static Load Test: 1000 N applied force
- Vibration Test: 20-2000 Hz, 5g acceleration
- Drop Test: 1.5 m height, rigid surface

**Thermal:**
- Steady-State Heating: 50 kW/m2 heat flux
- Thermal Cycling: -20C to 85C, 1000 cycles
- Convective Cooling: h=25 W/m2K

### Custom Configurations

Create your own test configuration by editing any preset's parameters and giving it a name. Click "Apply Configuration" to load the parameters into the active viewer.

---

## 12. AI Chat Assistant

The AI-powered simulation assistant lets you control the workbench through natural language.

### Opening the Chat Panel

Click the **chat bubble icon** in the toolbar to open the assistant panel.

### Configuring Your API Key

1. Click the **gear icon** in the chat panel header
2. Select a provider from the dropdown: **Claude** (Anthropic), **OpenAI**, **Gemini** (Google), or **Perplexity**
3. Enter your API key for the selected provider
4. Click **Save**

### Using the Assistant

Type natural language requests in the chat input. Examples:
- "Run a cantilever beam test with 1kN load"
- "Create a chip package thermal analysis with silver sinter DBA"
- "Compare the last two simulation results"
- "Generate a report for the most recent run"

The AI can create test cases, run simulations, analyze results, and generate reports on your behalf.

### Audio Playback

Click the **speaker icon** next to any assistant response to hear it read aloud via text-to-speech.

---

## 13. Simulation History & Recording

Every solver run is automatically recorded so you can review, compare, and report on past simulations.

### Viewing History

Click the **clock icon** in the toolbar to open the History panel. Each record shows:
- Timestamp, solver type, and run name
- Configuration snapshot (geometry, BCs, material)
- Results snapshot (key output values)

### Filtering and Searching

Use the **solver type** dropdown to filter by analysis type, or type in the search box to find records by name or keyword.

### Comparing Runs

1. Select exactly **two** records using the checkboxes
2. Click **Compare**
3. A side-by-side diff view shows parameter differences highlighted in yellow and result deltas with percentage changes

### Deleting Records

Select one or more records and click **Delete** to remove them from history. This action cannot be undone.

---

## 14. Report Generation

Generate detailed HTML reports from any simulation record.

### Creating a Report

1. Open the **History** panel (clock icon in toolbar)
2. Select one or more records
3. Click **Generate Report**

### Report Contents

Each report includes:
- **Configuration summary** — solver type, geometry dimensions, material properties
- **Input parameters table** — all boundary conditions and settings
- **Results table** — output values with units
- **Pass/fail criteria** — safety factors and limit checks (when applicable)

### Printing and Downloading

- Click the **Print** button to send the report to your system printer or save as PDF
- Click **Download** to save the report as a standalone HTML file

### Audio Narration

Click the **Speak** button at the top of any report to hear a text-to-speech summary of the key findings.

---

## 15. Design Exploration

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

## 16. Results Visualization

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

## 17. Saving and Opening Projects

### Save (Ctrl+S)

- Click **Save** in the toolbar or press Ctrl+S
- First save prompts for a file path (`.osw` format)
- Subsequent saves write to the same path automatically
- A success toast notification confirms the save

### Open

- Click **Open** in the toolbar
- Enter the path to an `.osw` project file
- The project loads and the schematic is restored

### Project Files

Projects are saved as `.osw` files (JSON format) containing:
- All system nodes and their positions
- Connection graph
- Geometry models and meshes
- Solver configurations and results
- Design exploration studies

### Security

- File paths are validated to prevent directory traversal attacks
- Only `.osw` files can be opened as projects
- Only `.stl` and `.obj` files can be imported as geometry
- Content Security Policy (CSP) prevents code injection

---

## 18. CLI Usage

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

## 19. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New project |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo (when available) |
| `Delete` | Remove selected system |
| `Escape` | Return to schematic from viewer |
| `F` | Fit view to content |

---

## 20. Chip Test Library

The Chip Test Library provides 32 industry-standard tests covering the full semiconductor lifecycle, from die-level qualification through board-level reliability.

### Step-by-Step Usage

1. Click the **Test Library** button in the toolbar
2. Browse tests by 5 lifecycle phase tabs: **Die/Wafer**, **Package Assembly**, **Package Reliability**, **Board-Level**, **System-Level**
3. Search by name, standard reference, or description using the search bar at the top
4. Click a test card to see full details: description, default parameters, and pass/fail criteria
5. Click **Select** to apply the test to your TestBed configuration
6. Click **Run Suite** on a scenario card to execute a multi-test qualification suite
7. The Test Suite Runner shows progress, per-test pass/fail, and generates reports

### Pre-Built Qualification Scenarios

Five qualification scenarios are included:

| Scenario | Tests | Standard |
|---|---|---|
| **BGA Qualification** | Thermal cycling, moisture sensitivity, ball shear | JEDEC |
| **AEC-Q100 Automotive** | Temperature cycling, HTOL, ESD | AEC-Q100 |
| **Power Module** | Power cycling, thermal impedance, isolation | IPC / JEDEC |
| **Consumer Electronics** | Drop test, thermal shock, humidity | IPC |
| **Flip Chip** | Underfill shear, bump fatigue, warpage | JEDEC / IPC |

---

## 21. Material Manager

The Material Manager lets you create, edit, and share custom materials alongside the built-in library.

### Step-by-Step Usage

1. Click the **Materials** button in the toolbar
2. The left panel shows all materials — built-in (locked) and custom (editable)
3. Click **Add New** to create a custom material
4. Enter properties:
   - Thermal conductivity (W/m K)
   - Young's modulus (GPa)
   - Poisson's ratio
   - CTE (ppm/K)
   - Density (kg/m3)
   - Specific heat (J/kg K)
   - Shear strength (MPa)
   - Display color
5. Click **Save** to persist (stored in localStorage, survives restarts)
6. Use **Export JSON** to share material libraries, **Import JSON** to load them

### Notes

- Built-in materials (Steel, Aluminum, Copper, Silicon, etc.) cannot be edited or deleted
- Custom materials appear in all material selection dropdowns throughout the application
- Exported JSON files can be shared between team members and imported on any machine

---

## 22. CSV Export

Export simulation data as CSV files for post-processing in spreadsheet applications.

### Step-by-Step Usage

1. From **ResultViewer**: click the **Export CSV** button in the toolbar to download field summaries
2. From **History Panel**: select records and click **Export All** to get a full CSV with all simulation data
3. CSV includes: field min/max/mean, pass/fail criteria results, solver parameters
4. Open in Excel, Google Sheets, or any spreadsheet application for post-processing

### CSV Contents

| Export Source | Columns Included |
|---|---|
| **Field Summary** | Field name, min, max, mean, unit |
| **Simulation Records** | Timestamp, solver type, config snapshot, all result values |
| **Vertex Data** | Node ID, X, Y, Z, field value at each node |

---

## 23. Scenario Manager

Save and restore complete simulation sessions as named scenarios for reproducibility and sharing.

### Step-by-Step Usage

1. Click the **Scenarios** button in the toolbar
2. To save: enter a name and description, then click **Save Snapshot** — this captures all current simulation records
3. To load: click **Load** on a saved scenario to restore all records
4. Use **Export** to save a scenario as a JSON file, **Import** to load from JSON
5. Share scenarios between team members via JSON files

### Use Cases

- Save a baseline configuration before experimenting with parameters
- Share a complete analysis session with a colleague for review
- Archive qualification test results for regulatory documentation

---

## 24. Solver Plugin System

The Plugin System provides an Ansys Workbench-style module registry showing all available solver modules and their coupling capabilities.

### Step-by-Step Usage

1. Click the **Plugins** button in the toolbar to open the Solver Module Registry
2. View 5 built-in modules: **Structural FEA**, **Thermal FEA**, **CFD (Stokes Flow)**, **Electromagnetic**, **Thermo-Mechanical (CTE)**
3. Each module shows: version, category, description, and status (Active)
4. Click a module to see details: output fields (with units), input parameters, and coupling capabilities
5. The **Provides** list shows what data this module can send to other modules
6. The **Consumes** list shows what data this module can receive
7. The **Coupling Diagram** at the bottom shows data flow connections between modules

### Example Coupling Paths

| Source Module | Data Field | Target Module |
|---|---|---|
| Thermal FEA | Temperature | Structural FEA |
| Electromagnetic | HeatGeneration | Thermal FEA |
| Thermal FEA | Temperature | Thermo-Mechanical (CTE) |
| CFD (Stokes) | Pressure | Structural FEA |

---

## 25. Chip Deformation Analysis

The Chip Deformation module performs coupled thermo-mechanical analysis to predict warpage and stress in semiconductor packages due to CTE mismatch between layers.

### Step-by-Step Usage

1. Open **Chip Package (DBA)** analysis from the schematic
2. In the toolbar toggle, select **Deformation** (alongside Thermal and Shear)
3. The system runs a coupled thermo-mechanical analysis:
   - **Step 1**: Thermal solve — temperature distribution across leadframe/DBA/die
   - **Step 2**: CTE strain computation — differential expansion between Si (2.6 ppm/K) and Cu (17 ppm/K)
   - **Step 3**: Structural solve — displacement, stress, and warpage from combined thermal + mechanical loads
4. Results include 6 fields: Temperature, Displacement, DisplacementMagnitude, VonMises, ThermalStress, Warpage
5. The **DeformationViewer** shows:
   - Deformation scale slider (1x to 100x magnification)
   - Field summary cards for all quantities
   - Warpage summary with package bow (um), pass/fail (25 um threshold), curvature radius
   - Layer-by-layer deformation table

### Pre-Built Deformation Scenarios

Six scenarios are available from the scenario selector:

| Scenario | Key Parameter | Description |
|---|---|---|
| **Thermal Gradient** | 50 kW/m2 heat flux | Pure thermal loading from die power dissipation |
| **Mechanical Shear** | 10 N lateral force | Pure mechanical shear on the DBA layer |
| **CTE Mismatch Warpage** | Delta-T = 100 C | Warpage from differential thermal expansion |
| **Reflow Peak Temperature** | 260 C | Solder reflow simulation at peak temperature |
| **Combined Thermo-Mechanical** | All loads | Worst-case combined thermal + mechanical loading |

---

## 26. Troubleshooting

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
