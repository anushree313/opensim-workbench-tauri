/**
 * Analytical calculation engine for chip package DBA analysis.
 * Implements 1D thermal resistance model, transient thermal (lumped backward Euler),
 * shear stress with safety factors, CTE mismatch, parameter sweep, and
 * experimental correlation per the die-attach-sim-spec.
 */

// ============================================================
// Material Database
// ============================================================

export interface ChipMaterial {
  name: string;
  k: number;            // Thermal conductivity [W/(m·K)]
  E: number;            // Young's modulus [Pa]
  nu: number;           // Poisson's ratio
  cte: number;          // CTE [1/K]
  density: number;      // Density [kg/m³]
  cp: number;           // Specific heat [J/(kg·K)]
  shearStrength: number; // Shear strength [Pa] (0 = not applicable)
  color: string;        // Display color
}

export const MATERIALS: Record<string, ChipMaterial> = {
  "Silicon":             { name: "Silicon",             k: 148,  E: 130e9, nu: 0.28, cte: 2.6e-6,  density: 2330, cp: 700,  shearStrength: 0,    color: "#6699cc" },
  "Copper Alloy C194":   { name: "Copper Alloy C194",   k: 260,  E: 120e9, nu: 0.34, cte: 17e-6,   density: 8900, cp: 385,  shearStrength: 0,    color: "#cc9966" },
  "Epoxy DBA":           { name: "Epoxy DBA",           k: 1.5,  E: 3.5e9, nu: 0.35, cte: 65e-6,   density: 1200, cp: 1200, shearStrength: 15e6, color: "#66cc99" },
  "Solder SAC305":       { name: "Solder SAC305",       k: 58,   E: 50e9,  nu: 0.35, cte: 21e-6,   density: 7400, cp: 230,  shearStrength: 30e6, color: "#cc6699" },
  "Silver Sinter":       { name: "Silver Sinter",       k: 250,  E: 9e9,   nu: 0.37, cte: 19e-6,   density: 8500, cp: 235,  shearStrength: 50e6, color: "#9999cc" },
  "Conductive Adhesive": { name: "Conductive Adhesive", k: 3.5,  E: 5e9,   nu: 0.35, cte: 40e-6,   density: 2000, cp: 900,  shearStrength: 12e6, color: "#cccc66" },
  "FR-4 PCB":            { name: "FR-4 PCB",            k: 0.3,  E: 22e9,  nu: 0.15, cte: 14e-6,   density: 1900, cp: 1100, shearStrength: 45e6, color: "#669966" },
  "Gold Wire":           { name: "Gold Wire",           k: 317,  E: 79e9,  nu: 0.44, cte: 14.2e-6, density: 19300, cp: 129,  shearStrength: 0,    color: "#ffcc33" },
};

export const DBA_MATERIALS = ["Epoxy DBA", "Solder SAC305", "Silver Sinter", "Conductive Adhesive"];

export const BUILTIN_MATERIAL_NAMES = new Set(Object.keys(MATERIALS));

const CUSTOM_MATERIALS_KEY = "opensim-custom-materials";

export function loadCustomMaterials(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
    if (raw) {
      const customs = JSON.parse(raw) as Record<string, ChipMaterial>;
      for (const [name, mat] of Object.entries(customs)) {
        MATERIALS[name] = mat;
      }
    }
  } catch { /* ignore parse errors */ }
}

export function saveCustomMaterial(mat: ChipMaterial): void {
  MATERIALS[mat.name] = mat;
  _persistCustom();
}

export function deleteCustomMaterial(name: string): void {
  if (BUILTIN_MATERIAL_NAMES.has(name)) return; // can't delete built-in
  delete MATERIALS[name];
  _persistCustom();
}

export function getCustomMaterials(): Record<string, ChipMaterial> {
  const result: Record<string, ChipMaterial> = {};
  for (const [name, mat] of Object.entries(MATERIALS)) {
    if (!BUILTIN_MATERIAL_NAMES.has(name)) {
      result[name] = mat;
    }
  }
  return result;
}

function _persistCustom(): void {
  const customs = getCustomMaterials();
  localStorage.setItem(CUSTOM_MATERIALS_KEY, JSON.stringify(customs));
}

// Load on module init
loadCustomMaterials();

// ============================================================
// Geometry Parameters
// ============================================================

export interface ChipGeometry {
  lf_w: number; lf_h: number; lf_t: number;    // lead frame [mm]
  dba_w: number; dba_h: number; dba_t: number;  // adhesive [mm]
  die_w: number; die_h: number; die_t: number;  // die [mm]
}

export const DEFAULT_GEOMETRY: ChipGeometry = {
  lf_w: 10, lf_h: 10, lf_t: 0.25,
  dba_w: 4.2, dba_h: 4.2, dba_t: 0.025,
  die_w: 4.1, die_h: 4.1, die_t: 0.3,
};

export interface ThermalBCs {
  heatFlux: number;       // [W/m²]
  bottomTemp: number;     // [°C] fixed bottom temperature
  convectionH?: number;   // [W/(m²·K)] convection coefficient (overrides fixed temp if >0)
  convectionTInf?: number; // [°C] convection ambient temperature
}

export interface ShearBCs {
  force: number;          // [N]
  direction: "X" | "Y" | "Z";
}

// ============================================================
// B.1 — Thermal Analysis (Fourier's Law, 1D Series Resistance)
// ============================================================

export interface ThermalResult {
  T_bottom: number;
  T_lf_top: number;
  T_dba_top: number;
  T_die_top: number;
  R_lf: number;
  R_dba: number;
  R_die: number;
  R_spreading: number;
  R_conv: number;         // convection resistance [K/W] (0 if fixed temp BC)
  R_total: number;
  R_jc: number;
  Q_total: number;
  q_lf: number;
  q_dba: number;
  q_die: number;
  layers: LayerThermalResult[];
}

export interface LayerThermalResult {
  name: string;
  T_min: number;
  T_max: number;
  T_mean: number;
  q_mag: number;
}

export function solveThermal(geo: ChipGeometry, bcs: ThermalBCs, dbaMat: string): ThermalResult {
  const mm2m = 1e-3;

  const A_die = (geo.die_w * mm2m) * (geo.die_h * mm2m);
  const A_dba = (geo.dba_w * mm2m) * (geo.dba_h * mm2m);
  const A_lf  = (geo.lf_w * mm2m) * (geo.lf_h * mm2m);

  const t_die = geo.die_t * mm2m;
  const t_dba = geo.dba_t * mm2m;
  const t_lf  = geo.lf_t * mm2m;

  const k_Si  = MATERIALS["Silicon"].k;
  const k_Cu  = MATERIALS["Copper Alloy C194"].k;
  const k_dba = MATERIALS[dbaMat]?.k ?? 1.5;

  const R_die = t_die / (k_Si * A_die);
  const R_dba = t_dba / (k_dba * A_dba);
  const R_lf  = t_lf / (k_Cu * A_lf);

  // Yovanovich spreading resistance
  const a = Math.sqrt(A_die / Math.PI);
  const b = Math.sqrt(A_lf / Math.PI);
  const eps = a / b;
  const R_spreading = Math.pow(1 - eps, 1.5) / (k_Cu * Math.sqrt(Math.PI * A_lf));

  // Convection resistance at bottom surface (spec sec 2.3)
  const h = bcs.convectionH ?? 0;
  const T_inf = bcs.convectionTInf ?? bcs.bottomTemp;
  const R_conv = h > 0 ? 1 / (h * A_lf) : 0;

  const R_total = R_die + R_dba + R_lf + R_spreading + R_conv;

  const Q_total = bcs.heatFlux * A_die;

  // With convection BC: T_ambient is fixed; T_bottom_surface = T_inf + Q_total * R_conv
  const T_ref   = h > 0 ? T_inf : bcs.bottomTemp;
  const T_bottom = T_ref + Q_total * R_conv;
  const T_lf_top  = T_bottom + Q_total * (R_lf + R_spreading);
  const T_dba_top = T_lf_top + Q_total * R_dba;
  const T_die_top = T_dba_top + Q_total * R_die;

  const R_jc = R_total > 0 ? (T_die_top - T_ref) / Q_total : 0;

  const q_lf  = t_lf  > 0 ? (T_lf_top  - T_bottom) / t_lf  * k_Cu  : 0;
  const q_dba = t_dba > 0 ? (T_dba_top - T_lf_top)  / t_dba * k_dba : 0;
  const q_die = t_die > 0 ? (T_die_top - T_dba_top) / t_die * k_Si  : 0;

  const layers: LayerThermalResult[] = [
    { name: "Leadframe", T_min: T_bottom,  T_max: T_lf_top,  T_mean: (T_bottom  + T_lf_top)  / 2, q_mag: Math.abs(q_lf)  },
    { name: "DBA",       T_min: T_lf_top,  T_max: T_dba_top, T_mean: (T_lf_top  + T_dba_top) / 2, q_mag: Math.abs(q_dba) },
    { name: "Die",       T_min: T_dba_top, T_max: T_die_top, T_mean: (T_dba_top + T_die_top) / 2, q_mag: Math.abs(q_die) },
  ];

  return { T_bottom, T_lf_top, T_dba_top, T_die_top, R_lf, R_dba, R_die, R_spreading, R_conv, R_total, R_jc, Q_total, q_lf, q_dba, q_die, layers };
}

// ============================================================
// B.1b — Transient Thermal (Lumped 1D, Backward Euler)
// Spec sec 5.4: ρ c_p ∂T/∂t = ∇·(k∇T) + q
// 3-node lumped model: T1=LF/DBA interface, T2=DBA/Die interface, T3=Die top
// ============================================================

export interface TransientParams {
  endTime: number;   // [s]
  dt: number;        // time step [s]
}

export interface TransientTimeStep {
  t: number;
  T_lf: number;    // LF/DBA interface temperature [°C]
  T_dba: number;   // DBA/Die interface temperature [°C]
  T_die: number;   // Die top temperature [°C]
}

export interface TransientResult {
  steps: TransientTimeStep[];
  steadyState: ThermalResult;
}

export function solveTransientThermal(
  geo: ChipGeometry, bcs: ThermalBCs, dbaMat: string, params: TransientParams
): TransientResult {
  const mm2m = 1e-3;

  const A_die = (geo.die_w * mm2m) * (geo.die_h * mm2m);
  const A_dba = (geo.dba_w * mm2m) * (geo.dba_h * mm2m);
  const A_lf  = (geo.lf_w * mm2m) * (geo.lf_h * mm2m);

  const t_die = geo.die_t * mm2m;
  const t_dba = geo.dba_t * mm2m;
  const t_lf  = geo.lf_t * mm2m;

  const k_Si  = MATERIALS["Silicon"].k;
  const k_Cu  = MATERIALS["Copper Alloy C194"].k;
  const k_dba = MATERIALS[dbaMat]?.k ?? 1.5;

  const matDba = MATERIALS[dbaMat] ?? MATERIALS["Epoxy DBA"];

  // Conductances [W/K]
  const G_lf  = k_Cu  * A_lf  / Math.max(t_lf,  1e-9);
  const G_dba = k_dba * A_dba / Math.max(t_dba, 1e-9);
  const G_die = k_Si  * A_die  / Math.max(t_die, 1e-9);

  // Lumped nodal capacitances [J/K] (half-cell volumes per node)
  const C1 = MATERIALS["Copper Alloy C194"].density * MATERIALS["Copper Alloy C194"].cp * A_lf * t_lf / 2
           + matDba.density * matDba.cp * A_dba * t_dba / 2;
  const C2 = matDba.density * matDba.cp * A_dba * t_dba / 2
           + MATERIALS["Silicon"].density * MATERIALS["Silicon"].cp * A_die * t_die / 2;
  const C3 = MATERIALS["Silicon"].density * MATERIALS["Silicon"].cp * A_die * t_die / 2;

  const Q = bcs.heatFlux * A_die;
  const T_bot = bcs.bottomTemp;

  // Initial condition: uniform at T_bot
  let T = [T_bot, T_bot, T_bot];

  const nSteps = Math.max(1, Math.ceil(params.endTime / params.dt));
  const dt = params.endTime / nSteps;

  // Steady-state RHS (load + BC contribution)
  const f0 = G_lf * T_bot;  // BC term for node 1 from fixed bottom temp

  const steps: TransientTimeStep[] = [
    { t: 0, T_lf: T_bot, T_dba: T_bot, T_die: T_bot },
  ];

  // Record every ~100 points for display
  const stride = Math.max(1, Math.floor(nSteps / 100));

  for (let n = 0; n < nSteps; n++) {
    // System matrix A = C/dt + K (3×3 symmetric)
    const A = [
      [C1 / dt + G_lf + G_dba, -G_dba,              0             ],
      [-G_dba,                  C2 / dt + G_dba + G_die, -G_die    ],
      [0,                       -G_die,              C3 / dt + G_die],
    ];

    // RHS: (C/dt)*T^n + steady-state load + BC
    const rhs = [
      C1 / dt * T[0] + f0,
      C2 / dt * T[1],
      C3 / dt * T[2] + Q,
    ];

    T = solve3x3(A, rhs);

    if ((n + 1) % stride === 0 || n === nSteps - 1) {
      steps.push({ t: (n + 1) * dt, T_lf: T[0], T_dba: T[1], T_die: T[2] });
    }
  }

  const steadyState = solveThermal(geo, bcs, dbaMat);
  return { steps, steadyState };
}

/** 3×3 Gaussian elimination with partial pivoting */
function solve3x3(A: number[][], b: number[]): number[] {
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(M[col][col]) < 1e-15) continue;
      const fac = M[row][col] / M[col][col];
      for (let j = col; j <= 3; j++) M[row][j] -= fac * M[col][j];
    }
  }

  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = M[i][3];
    for (let j = i + 1; j < 3; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i] || 1;
  }
  return x;
}

// ============================================================
// B.2 — Shear Analysis (with Safety Factor per spec sec 6.3)
// ============================================================

export interface ShearResult {
  tau_avg: number;
  tau_max: number;
  sigma_vm: number;
  delta_shear: number;
  delta_bend: number;
  delta_total: number;
  G_dba: number;
  sigma_bend_die: number;
  safetyFactor: number;    // SF = τ_allow / τ_max (spec sec 6.3)
  shearStrength: number;   // allowable shear stress [Pa]
  layers: LayerShearResult[];
}

export interface LayerShearResult {
  name: string;
  tau_min: number;
  tau_max: number;
  tau_mean: number;
  deformation: number;
}

export function solveShear(geo: ChipGeometry, bcs: ShearBCs, dbaMat: string): ShearResult {
  const mm2m = 1e-3;
  const F = bcs.force;

  const A_bond = (geo.dba_w * mm2m) * (geo.dba_h * mm2m);
  const t_dba = geo.dba_t * mm2m;
  const t_die = geo.die_t * mm2m;
  const t_lf  = geo.lf_t * mm2m;

  const mat_dba = MATERIALS[dbaMat] ?? MATERIALS["Epoxy DBA"];
  const mat_die = MATERIALS["Silicon"];

  const tau_avg  = F / Math.max(A_bond, 1e-12);
  const tau_max  = 1.5 * tau_avg;
  const sigma_vm = Math.sqrt(3) * tau_avg;

  const G_dba = mat_dba.E / (2 * (1 + mat_dba.nu));
  const delta_shear = F * t_dba / (G_dba * Math.max(A_bond, 1e-12));

  const M = F * (t_die / 2 + t_dba + t_lf / 2);
  const I_die = (geo.die_w * mm2m) * Math.pow(t_die, 3) / 12;
  const sigma_bend_die = I_die > 0 ? M * (t_die / 2) / I_die : 0;
  const L = (geo.die_w * mm2m) / 2;
  const delta_bend = I_die > 0 ? F * Math.pow(L, 3) / (3 * mat_die.E * I_die) : 0;
  const delta_total = delta_shear + delta_bend;

  // Safety factor (spec sec 6.3): SF = τ_allow / τ_max
  const shearStrength = mat_dba.shearStrength;
  const safetyFactor  = shearStrength > 0 && tau_max > 0 ? shearStrength / tau_max : Infinity;

  const layers: LayerShearResult[] = [
    { name: "Leadframe", tau_min: 0,            tau_max: sigma_bend_die * 0.3, tau_mean: sigma_bend_die * 0.15, deformation: delta_total * 0.1 },
    { name: "DBA",       tau_min: tau_avg * 0.8, tau_max: tau_max,             tau_mean: tau_avg,              deformation: delta_shear        },
    { name: "Die",       tau_min: 0,             tau_max: sigma_bend_die,      tau_mean: sigma_bend_die * 0.5, deformation: delta_total        },
  ];

  return { tau_avg, tau_max, sigma_vm, delta_shear, delta_bend, delta_total, G_dba, sigma_bend_die, safetyFactor, shearStrength, layers };
}

// ============================================================
// B.3 — CTE Mismatch / Warpage
// ============================================================

export interface CTEResult {
  delta_alpha: number;
  epsilon_thermal: number;
  sigma_thermal: number;
  warpage: number;
}

export function solveCTEMismatch(geo: ChipGeometry, thermalResult: ThermalResult, dbaMat: string): CTEResult {
  const mm2m = 1e-3;
  const mat_die = MATERIALS["Silicon"];
  const mat_lf  = MATERIALS["Copper Alloy C194"];
  const mat_dba = MATERIALS[dbaMat] ?? MATERIALS["Epoxy DBA"];

  const T_ref = 25.0;
  const T_die_avg = (thermalResult.T_dba_top + thermalResult.T_die_top) / 2;
  const deltaT = T_die_avg - T_ref;

  const delta_alpha    = Math.abs(mat_die.cte - mat_lf.cte);
  const epsilon_thermal = delta_alpha * deltaT;
  const sigma_thermal  = mat_dba.E * epsilon_thermal;

  const t_die = geo.die_t * mm2m;
  const t_lf  = geo.lf_t * mm2m;
  const alpha_diff = mat_lf.cte - mat_die.cte;

  const E_ratio = (mat_die.E * t_die * t_die + mat_lf.E * t_lf * t_lf) /
                  (mat_die.E * t_die + mat_lf.E * t_lf);
  const kappa = E_ratio > 0
    ? 6 * alpha_diff * deltaT * t_die * t_lf / (Math.pow(t_die + t_lf, 2) * E_ratio)
    : 0;
  const warpage = Math.abs(kappa) * Math.pow((geo.lf_w * mm2m) / 2, 2) / 2;

  return { delta_alpha, epsilon_thermal, sigma_thermal, warpage };
}

// ============================================================
// B.4 — Vertex Color Mapping
// ============================================================

export function temperatureToColor(t: number, tMin: number, tMax: number): [number, number, number] {
  const range = tMax - tMin;
  const norm = range > 0 ? Math.max(0, Math.min(1, (t - tMin) / range)) : 0.5;
  const hue = (1 - norm) * 240;
  return hslToRgb(hue / 360, 1, 0.5);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  switch (Math.floor(h * 6) % 6) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    case 5: r = c; b = x; break;
  }
  return [r + m, g + m, b + m];
}

// ============================================================
// B.5 — Full DBA Comparison
// ============================================================

export interface DBAComparisonResult {
  material: string;
  T_junction: number;
  R_jc: number;
  tau_max: number;
  delta_total: number;
  sigma_thermal: number;
  warpage: number;
  safetyFactor: number;
}

export function runFullComparison(
  geo: ChipGeometry, thermalBCs: ThermalBCs, shearBCs: ShearBCs
): DBAComparisonResult[] {
  return DBA_MATERIALS.map((mat) => {
    const thermal = solveThermal(geo, thermalBCs, mat);
    const shear   = solveShear(geo, shearBCs, mat);
    const cte     = solveCTEMismatch(geo, thermal, mat);
    return {
      material: mat,
      T_junction: thermal.T_die_top,
      R_jc: thermal.R_jc,
      tau_max: shear.tau_max,
      delta_total: shear.delta_total,
      sigma_thermal: cte.sigma_thermal,
      warpage: cte.warpage,
      safetyFactor: shear.safetyFactor,
    };
  });
}

// ============================================================
// B.6 — Parameter Sweep (spec sec 4.4, 3.1.4)
// ============================================================

export interface SweepResult {
  paramValue: number;
  T_junction: number;
  R_jc: number;
  tau_max: number;
  safetyFactor: number;
  warpage: number;
}

export type SweepableParam = keyof ChipGeometry;

export function runParameterSweep(
  geo: ChipGeometry, thermalBCs: ThermalBCs, shearBCs: ShearBCs, dbaMat: string,
  param: SweepableParam, values: number[]
): SweepResult[] {
  return values.map((v) => {
    const g = { ...geo, [param]: v };
    const thermal = solveThermal(g, thermalBCs, dbaMat);
    const shear   = solveShear(g, shearBCs, dbaMat);
    const cte     = solveCTEMismatch(g, thermal, dbaMat);
    return {
      paramValue: v,
      T_junction: thermal.T_die_top,
      R_jc: thermal.R_jc,
      tau_max: shear.tau_max,
      safetyFactor: shear.safetyFactor,
      warpage: cte.warpage,
    };
  });
}

/** Generate evenly spaced values */
export function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

// ============================================================
// B.7 — Experimental Correlation (spec sec 3.1.5)
// ============================================================

export interface ExperimentalData {
  T_junction?: number;   // measured junction temperature [°C]
  R_jc?: number;         // measured thermal resistance [K/W]
  tau_max?: number;      // measured failure shear stress [Pa]
  delta_total?: number;  // measured total deformation [m]
}

export interface CorrelationMetric {
  name: string;
  simulated: number;
  measured: number;
  error_pct: number;
  unit: string;
}

export interface CorrelationResult {
  metrics: CorrelationMetric[];
  rmse: number;   // root mean square of percentage errors
}

export function computeCorrelation(
  thermal: ThermalResult,
  shear: ShearResult | null,
  exp: ExperimentalData
): CorrelationResult {
  const metrics: CorrelationMetric[] = [];

  const add = (name: string, sim: number, meas: number | undefined, unit: string) => {
    if (meas == null || meas === 0) return;
    metrics.push({ name, simulated: sim, measured: meas, error_pct: ((sim - meas) / meas) * 100, unit });
  };

  add("T_junction", thermal.T_die_top, exp.T_junction, "°C");
  add("R_jc",       thermal.R_jc,      exp.R_jc,       "K/W");
  if (shear) {
    add("τ_max",    shear.tau_max,      exp.tau_max,     "Pa");
    add("δ_total",  shear.delta_total,  exp.delta_total, "m");
  }

  const rmse = metrics.length > 0
    ? Math.sqrt(metrics.reduce((s, m) => s + m.error_pct * m.error_pct, 0) / metrics.length)
    : 0;

  return { metrics, rmse };
}

// ============================================================
// Helpers
// ============================================================

export function formatSci(n: number, digits = 3): string {
  if (!isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (Math.abs(n) < 0.01 || Math.abs(n) > 1e6) return n.toExponential(digits);
  if (Math.abs(n) < 1) return n.toFixed(digits + 1);
  return n.toFixed(digits);
}

export function formatTemp(t: number): string {
  return t.toFixed(2) + " °C";
}

export function formatSF(sf: number): string {
  if (!isFinite(sf)) return "∞";
  return sf.toFixed(2);
}
