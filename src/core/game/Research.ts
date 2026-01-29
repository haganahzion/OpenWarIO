import { Gold } from "./Game";

/**
 * Research types available in the tech tree.
 * Flows left to right: 1 -> 2 -> 3 -> ... -> 8
 */
export enum ResearchType {
  BasicTrainingDoctrine = "BasicTrainingDoctrine",
  AdvancedFirearms = "AdvancedFirearms",
  BodyArmorMk1 = "BodyArmorMk1",
  TacticalAssaultTraining = "TacticalAssaultTraining",
  HeavyBodyArmor = "HeavyBodyArmor",
  CombatMedicIntegration = "CombatMedicIntegration",
  EliteInfantryDoctrine = "EliteInfantryDoctrine",
  SpecialForcesProgram = "SpecialForcesProgram",
}

/**
 * Definition of a research item including costs, prerequisites, and bonuses.
 */
export interface ResearchDefinition {
  type: ResearchType;
  name: string;
  description: string;
  cost: Gold;
  durationTicks: number; // How long to research (10 ticks = 1 second)
  prerequisites: ResearchType[];
  bonuses: ResearchBonuses;
  order: number; // Position in the tech tree (1-8, left to right)
}

/**
 * Bonuses provided by completing a research.
 * Attack/Defense bonuses are multipliers (1.05 = 5% bonus).
 * Damage reduction is a percentage (5 = 5% less damage taken).
 */
export interface ResearchBonuses {
  attackBonus?: number; // Multiplier for attack power (1.1 = +10% attack)
  damageReduction?: number; // Percentage reduction in damage taken (5 = -5% damage)
  healthBonus?: number; // Multiplier for troop health (1.2 = +20% health)
  defenseBonus?: number; // Multiplier for defense
  troopProductionBonus?: number; // Multiplier for troop generation
  goldProductionBonus?: number; // Multiplier for gold generation
  buildSpeedBonus?: number; // Multiplier for construction speed
}

/**
 * State of a player's research progress.
 */
export interface ResearchState {
  type: ResearchType;
  completed: boolean;
  startedAt: number | null; // Tick when research started, null if not started
  completedAt: number | null; // Tick when research completed
}

/**
 * All research definitions in the game.
 * Tech tree flows left (1) to right (8).
 */
export const RESEARCH_DEFINITIONS: Record<ResearchType, ResearchDefinition> = {
  [ResearchType.BasicTrainingDoctrine]: {
    type: ResearchType.BasicTrainingDoctrine,
    name: "Basic Training Doctrine",
    description: "+5% Infantry Attack",
    cost: 150_000n,
    durationTicks: 150 * 10, // 2.5 minutes (150 seconds)
    prerequisites: [],
    bonuses: {
      attackBonus: 1.05,
    },
    order: 1,
  },

  [ResearchType.AdvancedFirearms]: {
    type: ResearchType.AdvancedFirearms,
    name: "Advanced Firearms",
    description: "+10% Infantry Attack",
    cost: 200_000n,
    durationTicks: 180 * 10, // 3 minutes
    prerequisites: [ResearchType.BasicTrainingDoctrine],
    bonuses: {
      attackBonus: 1.10,
    },
    order: 2,
  },

  [ResearchType.BodyArmorMk1]: {
    type: ResearchType.BodyArmorMk1,
    name: "Body Armor Mk I",
    description: "-5% Damage Taken",
    cost: 225_000n,
    durationTicks: 180 * 10, // 3 minutes
    prerequisites: [ResearchType.AdvancedFirearms],
    bonuses: {
      damageReduction: 5,
    },
    order: 3,
  },

  [ResearchType.TacticalAssaultTraining]: {
    type: ResearchType.TacticalAssaultTraining,
    name: "Tactical Assault Training",
    description: "+15% Infantry Attack",
    cost: 325_000n,
    durationTicks: 270 * 10, // 4.5 minutes
    prerequisites: [ResearchType.BodyArmorMk1],
    bonuses: {
      attackBonus: 1.15,
    },
    order: 4,
  },

  [ResearchType.HeavyBodyArmor]: {
    type: ResearchType.HeavyBodyArmor,
    name: "Heavy Body Armor",
    description: "-10% Damage Taken",
    cost: 385_000n,
    durationTicks: 270 * 10, // 4.5 minutes
    prerequisites: [ResearchType.TacticalAssaultTraining],
    bonuses: {
      damageReduction: 10,
    },
    order: 5,
  },

  [ResearchType.CombatMedicIntegration]: {
    type: ResearchType.CombatMedicIntegration,
    name: "Combat Medic Integration",
    description: "+20% Infantry Health",
    cost: 452_000n,
    durationTicks: 270 * 10, // 4.5 minutes
    prerequisites: [ResearchType.HeavyBodyArmor],
    bonuses: {
      healthBonus: 1.20,
    },
    order: 6,
  },

  [ResearchType.EliteInfantryDoctrine]: {
    type: ResearchType.EliteInfantryDoctrine,
    name: "Elite Infantry Doctrine",
    description: "+20% Infantry Attack, -5% Damage Taken",
    cost: 950_000n,
    durationTicks: 300 * 10, // 5 minutes
    prerequisites: [ResearchType.CombatMedicIntegration],
    bonuses: {
      attackBonus: 1.20,
      damageReduction: 5,
    },
    order: 7,
  },

  [ResearchType.SpecialForcesProgram]: {
    type: ResearchType.SpecialForcesProgram,
    name: "Special Forces Program",
    description: "+25% Infantry Attack, +30% Infantry Health, -15% Damage Taken",
    cost: 3_500_000n,
    durationTicks: 390 * 10, // 6.5 minutes
    prerequisites: [ResearchType.EliteInfantryDoctrine],
    bonuses: {
      attackBonus: 1.25,
      healthBonus: 1.30,
      damageReduction: 15,
    },
    order: 8,
  },
};

/**
 * Get the definition for a research type.
 */
export function getResearchDefinition(type: ResearchType): ResearchDefinition {
  return RESEARCH_DEFINITIONS[type];
}

/**
 * Get all research types in order for display (left to right).
 */
export function getAllResearchTypes(): ResearchType[] {
  return Object.values(ResearchType).sort((a, b) => {
    return RESEARCH_DEFINITIONS[a].order - RESEARCH_DEFINITIONS[b].order;
  });
}

/**
 * Calculate combined bonuses from multiple completed researches.
 * Attack and health bonuses multiply together.
 * Damage reduction adds together.
 */
export function calculateCombinedBonuses(
  completedResearches: ResearchType[],
): ResearchBonuses {
  const combined: ResearchBonuses = {
    attackBonus: 1.0,
    defenseBonus: 1.0,
    healthBonus: 1.0,
    damageReduction: 0,
    troopProductionBonus: 1.0,
    goldProductionBonus: 1.0,
    buildSpeedBonus: 1.0,
  };

  // Defensive check for null/undefined input
  if (!completedResearches || !Array.isArray(completedResearches)) {
    return combined;
  }

  for (const researchType of completedResearches) {
    const def = RESEARCH_DEFINITIONS[researchType];
    // Skip if research type is invalid
    if (!def) {
      continue;
    }
    if (def.bonuses.attackBonus) {
      combined.attackBonus! *= def.bonuses.attackBonus;
    }
    if (def.bonuses.defenseBonus) {
      combined.defenseBonus! *= def.bonuses.defenseBonus;
    }
    if (def.bonuses.healthBonus) {
      combined.healthBonus! *= def.bonuses.healthBonus;
    }
    if (def.bonuses.damageReduction) {
      combined.damageReduction! += def.bonuses.damageReduction;
    }
    if (def.bonuses.troopProductionBonus) {
      combined.troopProductionBonus! *= def.bonuses.troopProductionBonus;
    }
    if (def.bonuses.goldProductionBonus) {
      combined.goldProductionBonus! *= def.bonuses.goldProductionBonus;
    }
    if (def.bonuses.buildSpeedBonus) {
      combined.buildSpeedBonus! *= def.bonuses.buildSpeedBonus;
    }
  }

  return combined;
}
