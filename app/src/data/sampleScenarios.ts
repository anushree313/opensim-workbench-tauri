/* ================================================================== */
/*  Pre-built Test Scenarios for Chip Package Qualification            */
/* ================================================================== */

export interface SampleScenario {
  id: string;
  name: string;
  description: string;
  testIds: string[];
  dbaOverride?: string;
  paramOverrides?: Record<string, Record<string, number>>;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: "bga_qualification",
    name: "BGA Package Qualification",
    description:
      "Standard qualification suite for Ball Grid Array packages. Covers thermal characterization, CTE mismatch, BGA solder joint reliability, JEDEC temperature cycling, and power cycling endurance.",
    testIds: [
      "DIE_THERMAL_CHAR",
      "DIE_CTE_MISMATCH",
      "IPC_9701_BGA",
      "JEDEC_A104_COND_G",
      "POWER_CYCLING",
    ],
    dbaOverride: "Solder SAC305",
  },
  {
    id: "aec_q100_grade1",
    name: "Automotive IC Qualification (AEC-Q100 Grade 1)",
    description:
      "Full automotive qualification per AEC-Q100 Grade 1 (-40/+125°C). Includes thermal, mechanical, environmental stress, and reliability tests required for automotive IC approval.",
    testIds: [
      "DIE_THERMAL_CHAR",
      "DIE_ATTACH_SHEAR",
      "AEC_Q100_TC",
      "JEDEC_HAST",
      "JEDEC_DROP",
      "POWER_CYCLING",
      "HIGH_TEMP_OPERATING",
      "VIBRATION_RANDOM",
    ],
    dbaOverride: "Silver Sinter",
    paramOverrides: {
      DIE_ATTACH_SHEAR: { force: 15 },
      POWER_CYCLING: { target_cycles: 15000 },
    },
  },
  {
    id: "power_module",
    name: "Power Module Reliability",
    description:
      "Reliability assessment for high-power modules. Focuses on thermal management, DBA material selection, power cycling endurance, and combined thermo-mechanical loading.",
    testIds: [
      "DIE_THERMAL_CHAR",
      "DBA_COMPARISON",
      "POWER_CYCLING",
      "THERMAL_SHUTDOWN",
      "JEDEC_A104_COND_B",
      "COMBINED_STRESS",
    ],
    dbaOverride: "Silver Sinter",
    paramOverrides: {
      DIE_THERMAL_CHAR: { power_dissipation: 20 },
      POWER_CYCLING: { power: 15, target_cycles: 20000 },
      COMBINED_STRESS: { heat_flux: 100000 },
    },
  },
  {
    id: "consumer_electronics",
    name: "Consumer Electronics Package",
    description:
      "Standard qualification for consumer electronics applications (0/+100°C range). Cost-optimized testing with SAC305 solder and relaxed cycling requirements.",
    testIds: [
      "DIE_THERMAL_CHAR",
      "SOLDER_JOINT_FATIGUE",
      "JEDEC_A104_COND_J",
      "BOARD_THERMAL_CYCLING",
      "REFLOW_PROFILE",
    ],
    dbaOverride: "Solder SAC305",
  },
  {
    id: "flip_chip_validation",
    name: "Flip Chip Assembly Validation",
    description:
      "Validation suite for flip-chip packages. Tests bump integrity, underfill adhesion, reflow survivability, CTE mismatch, and temperature cycling reliability.",
    testIds: [
      "FLIP_CHIP_BUMP_SHEAR",
      "UNDERFILL_SHEAR",
      "REFLOW_PROFILE",
      "DIE_CTE_MISMATCH",
      "JEDEC_A104_COND_G",
    ],
    dbaOverride: "Solder SAC305",
  },
];

/* ---- Helpers ---------------------------------------------------- */

export function getScenarioById(id: string): SampleScenario | undefined {
  return SAMPLE_SCENARIOS.find((s) => s.id === id);
}
