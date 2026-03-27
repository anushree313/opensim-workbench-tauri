/* ================================================================== */
/*  Chip Design/Fabrication/Packaging Test Library                     */
/*  32 industry-standard test definitions across 5 lifecycle phases    */
/* ================================================================== */

import type { ChipGeometry } from "../utils/chipCalculations";

/* ---- Types ------------------------------------------------------ */

export type ChipTestPhase =
  | "die_wafer"
  | "package_assembly"
  | "package_reliability"
  | "board_level"
  | "system_validation";

export type ChipTestCategory =
  | "thermal"
  | "mechanical"
  | "cte"
  | "reliability"
  | "qualification";

export interface PassCriterionTemplate {
  field: string;
  fieldLabel: string;
  operator: "lt" | "gt" | "lte" | "gte";
  threshold: number;
  unit: string;
}

export interface ChipTestDefinition {
  id: string;
  name: string;
  phase: ChipTestPhase;
  category: ChipTestCategory;
  standard: string;
  description: string;
  solverType:
    | "thermal"
    | "shear"
    | "cte"
    | "comparison"
    | "sweep"
    | "transient"
    | "combined";
  defaultParams: Record<string, number>;
  paramUnits: Record<string, string>;
  paramLabels: Record<string, string>;
  geometryOverrides?: Partial<ChipGeometry>;
  recommendedDBA?: string;
  defaultEnvironment: {
    ambientTemp: number;
    mounting: "Free" | "Fixed-Base" | "Clamped-All";
    convection: "Natural" | "Forced";
  };
  passCriteria: PassCriterionTemplate[];
}

/* ---- Phase Labels ----------------------------------------------- */

export const PHASE_LABELS: Record<ChipTestPhase, string> = {
  die_wafer: "Die / Wafer Level",
  package_assembly: "Package Assembly",
  package_reliability: "Package Reliability",
  board_level: "Board-Level Assembly",
  system_validation: "System-Level Validation",
};

export const CATEGORY_LABELS: Record<ChipTestCategory, string> = {
  thermal: "Thermal",
  mechanical: "Mechanical",
  cte: "CTE / Warpage",
  reliability: "Reliability",
  qualification: "Qualification",
};

/* ================================================================== */
/*  PHASE 1: Die / Wafer Level (5 tests)                              */
/* ================================================================== */

const PHASE1_TESTS: ChipTestDefinition[] = [
  {
    id: "DIE_THERMAL_CHAR",
    name: "Die Thermal Characterization",
    phase: "die_wafer",
    category: "thermal",
    standard: "JEDEC JESD51-1",
    description:
      "Measure junction-to-case thermal resistance by applying known power dissipation and measuring steady-state die temperature. Validates thermal path from active die surface through package layers.",
    solverType: "thermal",
    defaultParams: {
      power_dissipation: 5,
      junction_area: 16.81,
      ambient_temp: 25,
      bottom_temp: 25,
    },
    paramUnits: { power_dissipation: "W", junction_area: "mm²", ambient_temp: "°C", bottom_temp: "°C" },
    paramLabels: { power_dissipation: "Power Dissipation", junction_area: "Junction Area", ambient_temp: "Ambient Temp", bottom_temp: "Bottom Temp" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Junction Temperature", operator: "lt", threshold: 150, unit: "°C" },
      { field: "R_jc", fieldLabel: "Thermal Resistance (Rjc)", operator: "lt", threshold: 10, unit: "K/W" },
    ],
  },
  {
    id: "DIE_CTE_MISMATCH",
    name: "Die-to-Substrate CTE Mismatch",
    phase: "die_wafer",
    category: "cte",
    standard: "IPC-9701A §5.3",
    description:
      "Analyze thermally-induced stress from CTE mismatch between silicon die and copper leadframe. Evaluates warpage and interfacial stress during thermal excursions.",
    solverType: "cte",
    defaultParams: { delta_T: 100, ref_temp: 25, heat_flux: 50000 },
    paramUnits: { delta_T: "°C", ref_temp: "°C", heat_flux: "W/m²" },
    paramLabels: { delta_T: "Temperature Delta", ref_temp: "Reference Temp", heat_flux: "Heat Flux" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "Thermal Stress", operator: "lt", threshold: 50e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 25e-6, unit: "m" },
    ],
  },
  {
    id: "DIE_ATTACH_SHEAR",
    name: "Die Attach Shear Test",
    phase: "die_wafer",
    category: "mechanical",
    standard: "MIL-STD-883 Method 2019.9",
    description:
      "Evaluate die attach integrity by applying lateral shear force. Measures shear strength and safety factor of the die bond attach layer against delamination.",
    solverType: "shear",
    defaultParams: { force: 10, rate: 0.5 },
    paramUnits: { force: "N", rate: "mm/min" },
    paramLabels: { force: "Shear Force", rate: "Test Rate" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
      { field: "tau_max", fieldLabel: "Max Shear Stress", operator: "lt", threshold: 15e6, unit: "Pa" },
    ],
  },
  {
    id: "WAFER_WARPAGE",
    name: "Wafer-Level Warpage Analysis",
    phase: "die_wafer",
    category: "cte",
    standard: "SEMI MF1530",
    description:
      "Predict wafer warpage due to thermal processing. Models the full wafer diameter with CTE-driven deformation from process temperatures.",
    solverType: "cte",
    defaultParams: { wafer_diameter: 200, heat_flux: 30000, delta_T: 80 },
    paramUnits: { wafer_diameter: "mm", heat_flux: "W/m²", delta_T: "°C" },
    paramLabels: { wafer_diameter: "Wafer Diameter", heat_flux: "Heat Flux", delta_T: "Temp Delta" },
    geometryOverrides: { die_w: 200, die_h: 200, die_t: 0.725 },
    defaultEnvironment: { ambientTemp: 25, mounting: "Free", convection: "Natural" },
    passCriteria: [
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 50e-6, unit: "m" },
    ],
  },
  {
    id: "DIE_THERMAL_RESISTANCE",
    name: "Junction-to-Case Thermal Resistance",
    phase: "die_wafer",
    category: "thermal",
    standard: "JEDEC JESD51-14",
    description:
      "Compare thermal resistance across all DBA materials to identify the optimal die attach for thermal management. Uses transient dual interface method principles.",
    solverType: "comparison",
    defaultParams: { heat_flux: 100000, bottom_temp: 25 },
    paramUnits: { heat_flux: "W/m²", bottom_temp: "°C" },
    paramLabels: { heat_flux: "Heat Flux", bottom_temp: "Bottom Temp" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "R_jc", fieldLabel: "Thermal Resistance", operator: "lt", threshold: 5.0, unit: "K/W" },
    ],
  },
];

/* ================================================================== */
/*  PHASE 2: Package Assembly (6 tests)                               */
/* ================================================================== */

const PHASE2_TESTS: ChipTestDefinition[] = [
  {
    id: "WIRE_BOND_PULL",
    name: "Wire Bond Pull Test",
    phase: "package_assembly",
    category: "mechanical",
    standard: "MIL-STD-883 Method 2011.9",
    description:
      "Assess wire bond strength by modeling pull force on bond pad. Evaluates shear stress at the bond interface and safety margin against wire lift-off.",
    solverType: "shear",
    defaultParams: { pull_force: 5, wire_diameter: 0.025, bond_pad_size: 0.1 },
    paramUnits: { pull_force: "N", wire_diameter: "mm", bond_pad_size: "mm" },
    paramLabels: { pull_force: "Pull Force", wire_diameter: "Wire Diameter", bond_pad_size: "Bond Pad Size" },
    geometryOverrides: { dba_w: 0.1, dba_h: 0.1, dba_t: 0.025 },
    recommendedDBA: "Solder SAC305",
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "tau_max", fieldLabel: "Max Shear Stress", operator: "lt", threshold: 30e6, unit: "Pa" },
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 1.5, unit: "" },
    ],
  },
  {
    id: "SOLDER_JOINT_FATIGUE",
    name: "Solder Joint Thermal Fatigue",
    phase: "package_assembly",
    category: "reliability",
    standard: "IPC-9701A",
    description:
      "Predict solder joint fatigue life under thermal cycling. Evaluates CTE-driven stress in SAC305 solder joints between die and substrate during temperature excursions.",
    solverType: "cte",
    defaultParams: { T_min: -40, T_max: 125, dwell_time: 15, target_cycles: 1000 },
    paramUnits: { T_min: "°C", T_max: "°C", dwell_time: "min", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", dwell_time: "Dwell Time", target_cycles: "Target Cycles" },
    recommendedDBA: "Solder SAC305",
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 30e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 10e-6, unit: "m" },
    ],
  },
  {
    id: "DBA_COMPARISON",
    name: "DBA Material Comparison",
    phase: "package_assembly",
    category: "qualification",
    standard: "Internal",
    description:
      "Compare all available die bond attach materials (Epoxy, SAC305, Silver Sinter, Conductive Adhesive) across thermal, mechanical, and CTE performance to select the optimal interconnect.",
    solverType: "comparison",
    defaultParams: { heat_flux: 50000, shear_force: 10, bottom_temp: 25 },
    paramUnits: { heat_flux: "W/m²", shear_force: "N", bottom_temp: "°C" },
    paramLabels: { heat_flux: "Heat Flux", shear_force: "Shear Force", bottom_temp: "Bottom Temp" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Min Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
      { field: "T_die_top", fieldLabel: "Max Junction Temp", operator: "lt", threshold: 150, unit: "°C" },
    ],
  },
  {
    id: "LID_SEAL_THERMAL",
    name: "Lid Seal Thermal Integrity",
    phase: "package_assembly",
    category: "reliability",
    standard: "JEDEC JESD22-A103",
    description:
      "Evaluate package lid seal integrity during high-temperature storage. Models thermal stress on the adhesive layer at elevated temperature to predict seal failure.",
    solverType: "cte",
    defaultParams: { storage_temp: 150, heat_flux: 0, delta_T: 125 },
    paramUnits: { storage_temp: "°C", heat_flux: "W/m²", delta_T: "°C" },
    paramLabels: { storage_temp: "Storage Temp", heat_flux: "Heat Flux", delta_T: "Temp Delta" },
    defaultEnvironment: { ambientTemp: 150, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "Thermal Stress", operator: "lt", threshold: 20e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 15e-6, unit: "m" },
    ],
  },
  {
    id: "UNDERFILL_SHEAR",
    name: "Underfill Adhesion Shear Test",
    phase: "package_assembly",
    category: "mechanical",
    standard: "IPC-TM-650 2.4.24.6",
    description:
      "Test underfill adhesion strength by applying shear force to the epoxy layer. Validates that the underfill meets minimum shear strength for reliable flip-chip assembly.",
    solverType: "shear",
    defaultParams: { force: 20, rate: 1.0, bond_area: 16 },
    paramUnits: { force: "N", rate: "mm/min", bond_area: "mm²" },
    paramLabels: { force: "Shear Force", rate: "Test Rate", bond_area: "Bond Area" },
    geometryOverrides: { dba_w: 4, dba_h: 4, dba_t: 0.05 },
    recommendedDBA: "Epoxy DBA",
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 3.0, unit: "" },
    ],
  },
  {
    id: "FLIP_CHIP_BUMP_SHEAR",
    name: "Flip Chip Bump Shear",
    phase: "package_assembly",
    category: "mechanical",
    standard: "JEDEC JESD22-B117A",
    description:
      "Evaluate flip-chip solder bump shear strength. Models a single bump geometry under lateral force to assess bump-to-pad interface integrity.",
    solverType: "shear",
    defaultParams: { force: 0.5, bump_diameter: 0.1, bump_height: 0.075 },
    paramUnits: { force: "N", bump_diameter: "mm", bump_height: "mm" },
    paramLabels: { force: "Shear Force", bump_diameter: "Bump Diameter", bump_height: "Bump Height" },
    geometryOverrides: { dba_w: 0.1, dba_h: 0.1, dba_t: 0.075 },
    recommendedDBA: "Solder SAC305",
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "tau_max", fieldLabel: "Max Shear Stress", operator: "lt", threshold: 50e6, unit: "Pa" },
    ],
  },
];

/* ================================================================== */
/*  PHASE 3: Package Reliability — JEDEC/IPC/AEC (8 tests)            */
/* ================================================================== */

const PHASE3_TESTS: ChipTestDefinition[] = [
  {
    id: "JEDEC_A104_COND_B",
    name: "Temperature Cycling Condition B (-55/+125)",
    phase: "package_reliability",
    category: "reliability",
    standard: "JEDEC JESD22-A104 Condition B",
    description:
      "Industry-standard temperature cycling from -55°C to +125°C. Evaluates package reliability under wide thermal excursions for military/aerospace applications.",
    solverType: "cte",
    defaultParams: { T_min: -55, T_max: 125, ramp_rate: 10, dwell_time: 15, target_cycles: 500 },
    paramUnits: { T_min: "°C", T_max: "°C", ramp_rate: "°C/min", dwell_time: "min", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ramp_rate: "Ramp Rate", dwell_time: "Dwell Time", target_cycles: "Target Cycles" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 40e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 20e-6, unit: "m" },
    ],
  },
  {
    id: "JEDEC_A104_COND_G",
    name: "Temperature Cycling Condition G (-40/+125)",
    phase: "package_reliability",
    category: "reliability",
    standard: "JEDEC JESD22-A104 Condition G",
    description:
      "Standard automotive/industrial temperature cycling from -40°C to +125°C. The most common qualification condition for commercial IC packages.",
    solverType: "cte",
    defaultParams: { T_min: -40, T_max: 125, ramp_rate: 10, dwell_time: 15, target_cycles: 1000 },
    paramUnits: { T_min: "°C", T_max: "°C", ramp_rate: "°C/min", dwell_time: "min", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ramp_rate: "Ramp Rate", dwell_time: "Dwell Time", target_cycles: "Target Cycles" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 40e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 20e-6, unit: "m" },
    ],
  },
  {
    id: "JEDEC_A104_COND_J",
    name: "Temperature Cycling Condition J (0/+100)",
    phase: "package_reliability",
    category: "reliability",
    standard: "JEDEC JESD22-A104 Condition J",
    description:
      "Mild temperature cycling from 0°C to +100°C for consumer electronics. Represents typical operating conditions for indoor electronic devices.",
    solverType: "cte",
    defaultParams: { T_min: 0, T_max: 100, ramp_rate: 10, dwell_time: 15, target_cycles: 2000 },
    paramUnits: { T_min: "°C", T_max: "°C", ramp_rate: "°C/min", dwell_time: "min", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ramp_rate: "Ramp Rate", dwell_time: "Dwell Time", target_cycles: "Target Cycles" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 30e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 15e-6, unit: "m" },
    ],
  },
  {
    id: "JEDEC_HAST",
    name: "Highly Accelerated Stress Test (HAST)",
    phase: "package_reliability",
    category: "reliability",
    standard: "JEDEC JESD22-A110",
    description:
      "Accelerated moisture/temperature stress at 130°C and 85% relative humidity. Tests package hermeticity and moisture-induced failures under biased conditions.",
    solverType: "thermal",
    defaultParams: { temperature: 130, humidity_rh: 85, bias_voltage: 3.3, duration_hours: 96 },
    paramUnits: { temperature: "°C", humidity_rh: "%RH", bias_voltage: "V", duration_hours: "hr" },
    paramLabels: { temperature: "Temperature", humidity_rh: "Humidity", bias_voltage: "Bias Voltage", duration_hours: "Duration" },
    defaultEnvironment: { ambientTemp: 130, mounting: "Fixed-Base", convection: "Forced" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Junction Temperature", operator: "lt", threshold: 150, unit: "°C" },
    ],
  },
  {
    id: "JEDEC_DROP",
    name: "Board Level Drop Test (1500G)",
    phase: "package_reliability",
    category: "mechanical",
    standard: "JEDEC JESD22-B111",
    description:
      "Simulate board-level drop impact at 1500G peak acceleration with 0.5ms half-sine pulse. Evaluates solder joint integrity under mechanical shock for handheld devices.",
    solverType: "shear",
    defaultParams: { peak_acceleration: 1500, pulse_duration: 0.5, drop_count: 30 },
    paramUnits: { peak_acceleration: "G", pulse_duration: "ms", drop_count: "drops" },
    paramLabels: { peak_acceleration: "Peak Acceleration", pulse_duration: "Pulse Duration", drop_count: "Drop Count" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 1.5, unit: "" },
      { field: "tau_max", fieldLabel: "Max Shear Stress", operator: "lt", threshold: 25e6, unit: "Pa" },
    ],
  },
  {
    id: "IPC_SHEAR_2424",
    name: "IPC Shear Test",
    phase: "package_reliability",
    category: "mechanical",
    standard: "IPC-TM-650 2.4.24",
    description:
      "Standard IPC shear test method for surface mount components. Applies controlled lateral force to evaluate solder joint and component-to-board attachment strength.",
    solverType: "shear",
    defaultParams: { force: 10, rate: 0.5, test_temp: 25 },
    paramUnits: { force: "N", rate: "mm/min", test_temp: "°C" },
    paramLabels: { force: "Shear Force", rate: "Test Rate", test_temp: "Test Temp" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
  {
    id: "IPC_9701_BGA",
    name: "BGA Solder Joint Reliability",
    phase: "package_reliability",
    category: "reliability",
    standard: "IPC-9701A",
    description:
      "Comprehensive BGA solder joint reliability assessment per IPC-9701. Evaluates thermal fatigue, CTE mismatch stress, and shear strength for ball grid array packages.",
    solverType: "combined",
    defaultParams: { T_min: -40, T_max: 125, ball_pitch: 1.0, ball_diameter: 0.6, target_cycles: 1000 },
    paramUnits: { T_min: "°C", T_max: "°C", ball_pitch: "mm", ball_diameter: "mm", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ball_pitch: "Ball Pitch", ball_diameter: "Ball Diameter", target_cycles: "Target Cycles" },
    geometryOverrides: { dba_w: 0.6, dba_h: 0.6, dba_t: 0.3 },
    recommendedDBA: "Solder SAC305",
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 25e6, unit: "Pa" },
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
  {
    id: "AEC_Q100_TC",
    name: "Automotive Temp Cycling (AEC-Q100 Grade 1)",
    phase: "package_reliability",
    category: "qualification",
    standard: "AEC-Q100 Rev H",
    description:
      "Automotive qualification temperature cycling per AEC-Q100 Grade 1 (-40/+125°C). Stricter criteria than consumer JEDEC tests, required for all automotive IC packages.",
    solverType: "cte",
    defaultParams: { T_min: -40, T_max: 125, ramp_rate: 15, dwell_time: 10, target_cycles: 1000, grade: 1 },
    paramUnits: { T_min: "°C", T_max: "°C", ramp_rate: "°C/min", dwell_time: "min", target_cycles: "cycles", grade: "" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ramp_rate: "Ramp Rate", dwell_time: "Dwell Time", target_cycles: "Target Cycles", grade: "AEC Grade" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 30e6, unit: "Pa" },
      { field: "warpage", fieldLabel: "Warpage", operator: "lt", threshold: 15e-6, unit: "m" },
    ],
  },
];

/* ================================================================== */
/*  PHASE 4: Board-Level Assembly (5 tests)                           */
/* ================================================================== */

const PHASE4_TESTS: ChipTestDefinition[] = [
  {
    id: "REFLOW_PROFILE",
    name: "Reflow Soldering Thermal Profile",
    phase: "board_level",
    category: "thermal",
    standard: "IPC/JEDEC J-STD-020",
    description:
      "Simulate the reflow soldering thermal profile from preheat through peak temperature. Evaluates die temperature during the 260°C peak reflow to ensure survival.",
    solverType: "transient",
    defaultParams: { preheat_temp: 150, soak_time: 90, peak_temp: 260, time_above_217: 60, ramp_rate: 3 },
    paramUnits: { preheat_temp: "°C", soak_time: "s", peak_temp: "°C", time_above_217: "s", ramp_rate: "°C/s" },
    paramLabels: { preheat_temp: "Preheat Temp", soak_time: "Soak Time", peak_temp: "Peak Temp", time_above_217: "Time Above 217°C", ramp_rate: "Ramp Rate" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Free", convection: "Forced" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Peak Die Temp", operator: "lt", threshold: 260, unit: "°C" },
    ],
  },
  {
    id: "BOARD_THERMAL_CYCLING",
    name: "Board Level Thermal Cycling",
    phase: "board_level",
    category: "reliability",
    standard: "IPC-9701A §4",
    description:
      "Board-level thermal cycling to evaluate package-to-board solder joint reliability. Uses PCB-scale geometry with extended cycling to predict field life.",
    solverType: "cte",
    defaultParams: { T_min: 0, T_max: 100, ramp_rate: 10, dwell_time: 10, target_cycles: 6000 },
    paramUnits: { T_min: "°C", T_max: "°C", ramp_rate: "°C/min", dwell_time: "min", target_cycles: "cycles" },
    paramLabels: { T_min: "Min Temp", T_max: "Max Temp", ramp_rate: "Ramp Rate", dwell_time: "Dwell Time", target_cycles: "Target Cycles" },
    geometryOverrides: { lf_w: 20, lf_h: 20, lf_t: 1.6 },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "Thermal Stress", operator: "lt", threshold: 20e6, unit: "Pa" },
    ],
  },
  {
    id: "BOARD_FLEX",
    name: "Board Flex / Bend Test",
    phase: "board_level",
    category: "mechanical",
    standard: "IPC/JEDEC-9702",
    description:
      "Monotonic board bend test to evaluate package resistance to PCB flexure. Models bending-equivalent shear stress on solder joints during board handling and assembly.",
    solverType: "shear",
    defaultParams: { deflection: 2, span: 100, board_thickness: 1.6, strain_limit: 500 },
    paramUnits: { deflection: "mm", span: "mm", board_thickness: "mm", strain_limit: "µstrain" },
    paramLabels: { deflection: "Deflection", span: "Span", board_thickness: "Board Thickness", strain_limit: "Strain Limit" },
    geometryOverrides: { lf_w: 20, lf_h: 20, lf_t: 1.6 },
    defaultEnvironment: { ambientTemp: 25, mounting: "Clamped-All", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
  {
    id: "VIBRATION_RANDOM",
    name: "Random Vibration Test",
    phase: "board_level",
    category: "mechanical",
    standard: "JEDEC JESD22-B103",
    description:
      "Random vibration qualification with broadband PSD excitation. Converts RMS G-level to equivalent static force for solder joint stress assessment.",
    solverType: "shear",
    defaultParams: { psd_level: 0.04, freq_min: 20, freq_max: 2000, duration_hours: 6, grms: 14.1 },
    paramUnits: { psd_level: "G²/Hz", freq_min: "Hz", freq_max: "Hz", duration_hours: "hr", grms: "Grms" },
    paramLabels: { psd_level: "PSD Level", freq_min: "Min Freq", freq_max: "Max Freq", duration_hours: "Duration", grms: "Grms" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
  {
    id: "VIBRATION_SINE",
    name: "Sinusoidal Vibration Test",
    phase: "board_level",
    category: "mechanical",
    standard: "MIL-STD-883 Method 2007.3",
    description:
      "Swept sinusoidal vibration test from 20Hz to 2000Hz. Evaluates package resonance susceptibility and solder joint fatigue under harmonic excitation.",
    solverType: "shear",
    defaultParams: { g_level: 20, freq_min: 20, freq_max: 2000, sweep_rate: 1 },
    paramUnits: { g_level: "G", freq_min: "Hz", freq_max: "Hz", sweep_rate: "oct/min" },
    paramLabels: { g_level: "G Level", freq_min: "Min Freq", freq_max: "Max Freq", sweep_rate: "Sweep Rate" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 1.5, unit: "" },
    ],
  },
];

/* ================================================================== */
/*  PHASE 5: System-Level Validation (8 tests)                        */
/* ================================================================== */

const PHASE5_TESTS: ChipTestDefinition[] = [
  {
    id: "POWER_CYCLING",
    name: "Power Cycling Endurance",
    phase: "system_validation",
    category: "reliability",
    standard: "JEDEC JESD22-A105",
    description:
      "Power cycling endurance test with on/off thermal transients. Evaluates die attach and solder joint fatigue from repeated junction temperature swings during operation.",
    solverType: "cte",
    defaultParams: { power: 5, on_time: 60, off_time: 60, target_cycles: 10000, delta_Tj: 100 },
    paramUnits: { power: "W", on_time: "s", off_time: "s", target_cycles: "cycles", delta_Tj: "°C" },
    paramLabels: { power: "Power", on_time: "On Time", off_time: "Off Time", target_cycles: "Target Cycles", delta_Tj: "Junction ΔT" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Junction Temp", operator: "lt", threshold: 175, unit: "°C" },
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 40e6, unit: "Pa" },
    ],
  },
  {
    id: "THERMAL_SHUTDOWN",
    name: "Thermal Shutdown Characterization",
    phase: "system_validation",
    category: "thermal",
    standard: "Internal",
    description:
      "Characterize thermal shutdown behavior by sweeping power dissipation from low to high. Identifies the power level at which junction temperature exceeds the shutdown threshold.",
    solverType: "sweep",
    defaultParams: { shutdown_temp: 150, max_power: 20, ambient_temp: 85, sweep_points: 10 },
    paramUnits: { shutdown_temp: "°C", max_power: "W", ambient_temp: "°C", sweep_points: "" },
    paramLabels: { shutdown_temp: "Shutdown Temp", max_power: "Max Power", ambient_temp: "Ambient Temp", sweep_points: "Sweep Points" },
    defaultEnvironment: { ambientTemp: 85, mounting: "Fixed-Base", convection: "Forced" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Max Junction Temp", operator: "lt", threshold: 150, unit: "°C" },
    ],
  },
  {
    id: "ARRHENIUS_RELIABILITY",
    name: "Long-Term Reliability (Arrhenius)",
    phase: "system_validation",
    category: "reliability",
    standard: "JEDEC JEP122",
    description:
      "Estimate long-term field reliability using Arrhenius acceleration model. Maps accelerated test results at elevated temperature to expected lifetime at use conditions.",
    solverType: "thermal",
    defaultParams: { activation_energy: 0.7, use_temp: 55, test_temp: 125, test_hours: 1000, target_life_hours: 100000 },
    paramUnits: { activation_energy: "eV", use_temp: "°C", test_temp: "°C", test_hours: "hr", target_life_hours: "hr" },
    paramLabels: { activation_energy: "Activation Energy", use_temp: "Use Temp", test_temp: "Test Temp", test_hours: "Test Hours", target_life_hours: "Target Life" },
    defaultEnvironment: { ambientTemp: 125, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Test Junction Temp", operator: "lt", threshold: 150, unit: "°C" },
    ],
  },
  {
    id: "THERMAL_IMPEDANCE",
    name: "Thermal Impedance (Zth) Characterization",
    phase: "system_validation",
    category: "thermal",
    standard: "JEDEC JESD51-14",
    description:
      "Measure transient thermal impedance Zth(t) by applying a step power input and tracking temperature response. Used to derive the thermal RC network model.",
    solverType: "transient",
    defaultParams: { power_step: 10, measurement_time: 10, dt: 0.01 },
    paramUnits: { power_step: "W", measurement_time: "s", dt: "s" },
    paramLabels: { power_step: "Power Step", measurement_time: "Measurement Time", dt: "Time Step" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "R_jc", fieldLabel: "Steady-State Rjc", operator: "lt", threshold: 5.0, unit: "K/W" },
    ],
  },
  {
    id: "HIGH_TEMP_OPERATING",
    name: "High Temperature Operating Life (HTOL)",
    phase: "system_validation",
    category: "reliability",
    standard: "JEDEC JESD22-A108",
    description:
      "High temperature operating life test at 125°C ambient with operational power. Accelerated aging test to verify long-term device reliability under worst-case thermal conditions.",
    solverType: "thermal",
    defaultParams: { ambient_temp: 125, power: 3, duration_hours: 1000, bias_voltage: 3.3 },
    paramUnits: { ambient_temp: "°C", power: "W", duration_hours: "hr", bias_voltage: "V" },
    paramLabels: { ambient_temp: "Ambient Temp", power: "Power", duration_hours: "Duration", bias_voltage: "Bias Voltage" },
    defaultEnvironment: { ambientTemp: 125, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Junction Temp", operator: "lt", threshold: 175, unit: "°C" },
    ],
  },
  {
    id: "MULTI_DBA_SWEEP",
    name: "DBA Thickness Parameter Sweep",
    phase: "system_validation",
    category: "qualification",
    standard: "Internal",
    description:
      "Parametric sweep of DBA layer thickness to find the optimal trade-off between thermal resistance and mechanical stress. Identifies design sweet spot for die attach thickness.",
    solverType: "sweep",
    defaultParams: { dba_t_min: 0.01, dba_t_max: 0.1, sweep_steps: 10, heat_flux: 50000, shear_force: 10 },
    paramUnits: { dba_t_min: "mm", dba_t_max: "mm", sweep_steps: "", heat_flux: "W/m²", shear_force: "N" },
    paramLabels: { dba_t_min: "Min DBA Thickness", dba_t_max: "Max DBA Thickness", sweep_steps: "Sweep Steps", heat_flux: "Heat Flux", shear_force: "Shear Force" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "safetyFactor", fieldLabel: "Min Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
  {
    id: "COMBINED_STRESS",
    name: "Combined Thermo-Mechanical Stress",
    phase: "system_validation",
    category: "qualification",
    standard: "Internal",
    description:
      "Multi-physics analysis combining thermal, mechanical shear, and CTE mismatch loads simultaneously. Provides worst-case stress assessment for design margin evaluation.",
    solverType: "combined",
    defaultParams: { heat_flux: 50000, shear_force: 10, delta_T: 100 },
    paramUnits: { heat_flux: "W/m²", shear_force: "N", delta_T: "°C" },
    paramLabels: { heat_flux: "Heat Flux", shear_force: "Shear Force", delta_T: "Temp Delta" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "sigma_thermal", fieldLabel: "CTE Stress", operator: "lt", threshold: 40e6, unit: "Pa" },
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
      { field: "T_die_top", fieldLabel: "Junction Temp", operator: "lt", threshold: 150, unit: "°C" },
    ],
  },
  {
    id: "PACKAGE_QUALIFICATION",
    name: "Full Package Qualification Summary",
    phase: "system_validation",
    category: "qualification",
    standard: "JEDEC JESD47",
    description:
      "Comprehensive package qualification combining thermal, shear, and CTE analyses across all DBA materials. Provides a full comparison matrix for qualification documentation.",
    solverType: "comparison",
    defaultParams: { heat_flux: 50000, shear_force: 10, T_min: -40, T_max: 125 },
    paramUnits: { heat_flux: "W/m²", shear_force: "N", T_min: "°C", T_max: "°C" },
    paramLabels: { heat_flux: "Heat Flux", shear_force: "Shear Force", T_min: "Min Temp", T_max: "Max Temp" },
    defaultEnvironment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
    passCriteria: [
      { field: "T_die_top", fieldLabel: "Junction Temp", operator: "lt", threshold: 150, unit: "°C" },
      { field: "safetyFactor", fieldLabel: "Safety Factor", operator: "gte", threshold: 2.0, unit: "" },
    ],
  },
];

/* ================================================================== */
/*  Combined Library                                                   */
/* ================================================================== */

export const CHIP_TEST_LIBRARY: ChipTestDefinition[] = [
  ...PHASE1_TESTS,
  ...PHASE2_TESTS,
  ...PHASE3_TESTS,
  ...PHASE4_TESTS,
  ...PHASE5_TESTS,
];

/* ---- Query Helpers ---------------------------------------------- */

export function getTestById(id: string): ChipTestDefinition | undefined {
  return CHIP_TEST_LIBRARY.find((t) => t.id === id);
}

export function getTestsByPhase(phase: ChipTestPhase): ChipTestDefinition[] {
  return CHIP_TEST_LIBRARY.filter((t) => t.phase === phase);
}

export function getTestsByCategory(category: ChipTestCategory): ChipTestDefinition[] {
  return CHIP_TEST_LIBRARY.filter((t) => t.category === category);
}

export function searchTests(query: string): ChipTestDefinition[] {
  const q = query.toLowerCase();
  return CHIP_TEST_LIBRARY.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.standard.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
  );
}
