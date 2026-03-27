/* ================================================================== */
/*  Chip Deformation Stress Scenarios                                  */
/*  Demonstrates thermo-mechanical coupled analysis capabilities       */
/* ================================================================== */

export interface DeformationScenario {
  id: string;
  name: string;
  description: string;
  category: "thermal" | "mechanical" | "cte" | "reflow" | "combined";
  thermalParams: {
    heat_flux: number;
    bottom_temp: number;
  };
  structuralParams: {
    shear_force: number;
  };
  cteParams: {
    ref_temperature: number;
    delta_T?: number;
  };
  expectedResults: {
    max_temperature_C: number;
    max_displacement_um: number;
    max_vonmises_MPa: number;
    max_warpage_um: number;
  };
  passCriteria: {
    max_warpage_um: number;
    max_stress_MPa: number;
    max_temperature_C: number;
  };
  dbaMaterial: string;
}

export const DEFORMATION_SCENARIOS: DeformationScenario[] = [
  {
    id: "thermal_gradient",
    name: "Thermal Gradient Deformation",
    description:
      "Steady-state heat flux (50 kW/m²) through 3-layer chip package. Die generates heat, leadframe acts as heat spreader. CTE mismatch between Silicon (2.6 ppm/K) and Copper (17 ppm/K) creates differential expansion and warpage.",
    category: "thermal",
    thermalParams: { heat_flux: 50000, bottom_temp: 25 },
    structuralParams: { shear_force: 0 },
    cteParams: { ref_temperature: 25 },
    expectedResults: {
      max_temperature_C: 85,
      max_displacement_um: 5,
      max_vonmises_MPa: 120,
      max_warpage_um: 8,
    },
    passCriteria: {
      max_warpage_um: 25,
      max_stress_MPa: 200,
      max_temperature_C: 150,
    },
    dbaMaterial: "Epoxy DBA",
  },
  {
    id: "mechanical_shear",
    name: "Mechanical Shear Deformation",
    description:
      "Lateral shear force (10N) applied to die top surface with fixed leadframe base. Evaluates stress concentration at the DBA layer interface and maximum lateral displacement.",
    category: "mechanical",
    thermalParams: { heat_flux: 0, bottom_temp: 25 },
    structuralParams: { shear_force: 10 },
    cteParams: { ref_temperature: 25 },
    expectedResults: {
      max_temperature_C: 25,
      max_displacement_um: 2,
      max_vonmises_MPa: 80,
      max_warpage_um: 1,
    },
    passCriteria: {
      max_warpage_um: 25,
      max_stress_MPa: 150,
      max_temperature_C: 200,
    },
    dbaMaterial: "Epoxy DBA",
  },
  {
    id: "cte_mismatch",
    name: "CTE Mismatch Warpage (ΔT = 100°C)",
    description:
      "Temperature cycling from 25°C to 125°C. Large CTE mismatch between Si die (2.6 ppm/K) and Cu leadframe (17 ppm/K) creates bimetallic-strip effect, bowing the package. Critical for BGA reliability.",
    category: "cte",
    thermalParams: { heat_flux: 100000, bottom_temp: 25 },
    structuralParams: { shear_force: 0 },
    cteParams: { ref_temperature: 25, delta_T: 100 },
    expectedResults: {
      max_temperature_C: 125,
      max_displacement_um: 15,
      max_vonmises_MPa: 180,
      max_warpage_um: 20,
    },
    passCriteria: {
      max_warpage_um: 25,
      max_stress_MPa: 250,
      max_temperature_C: 175,
    },
    dbaMaterial: "Solder SAC305",
  },
  {
    id: "reflow_peak",
    name: "Reflow Peak Temperature (260°C)",
    description:
      "Simulates peak reflow soldering temperature (260°C). Extreme thermal gradient from die surface to ambient creates maximum warpage condition. Tests whether the package can survive assembly without delamination.",
    category: "reflow",
    thermalParams: { heat_flux: 200000, bottom_temp: 25 },
    structuralParams: { shear_force: 0 },
    cteParams: { ref_temperature: 25, delta_T: 235 },
    expectedResults: {
      max_temperature_C: 260,
      max_displacement_um: 35,
      max_vonmises_MPa: 350,
      max_warpage_um: 45,
    },
    passCriteria: {
      max_warpage_um: 50,
      max_stress_MPa: 500,
      max_temperature_C: 300,
    },
    dbaMaterial: "Solder SAC305",
  },
  {
    id: "combined_stress",
    name: "Combined Thermo-Mechanical (Worst Case)",
    description:
      "Worst-case operating envelope: heat flux from power dissipation (100 kW/m²) PLUS mechanical shear from board flex (5N) PLUS CTE mismatch from ΔT. Represents field conditions with thermal cycling under mechanical load.",
    category: "combined",
    thermalParams: { heat_flux: 100000, bottom_temp: 25 },
    structuralParams: { shear_force: 5 },
    cteParams: { ref_temperature: 25, delta_T: 100 },
    expectedResults: {
      max_temperature_C: 125,
      max_displacement_um: 18,
      max_vonmises_MPa: 220,
      max_warpage_um: 22,
    },
    passCriteria: {
      max_warpage_um: 30,
      max_stress_MPa: 300,
      max_temperature_C: 175,
    },
    dbaMaterial: "Silver Sinter",
  },
];

export function getDeformationScenario(id: string): DeformationScenario | undefined {
  return DEFORMATION_SCENARIOS.find((s) => s.id === id);
}
