import { Gold } from "./Game";

/**
 * Research types available in the tech tree.
 * Each research provides specific bonuses when completed.
 */
export enum ResearchType {
  // Tier 1 - Basic researches (no prerequisites)
  InfantryImprovements = "InfantryImprovements",

  // Tier 2 - Requires InfantryImprovements
  BetterTech = "BetterTech",

  // Future research types can be added here:
  // AdvancedLogistics = "AdvancedLogistics",
  // ImprovedDefenses = "ImprovedDefenses",
  // NavalSupremacy = "NavalSupremacy",
  // NuclearResearch = "NuclearResearch",
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
}

/**
 * Bonuses provided by completing a research.
 * All bonuses are multipliers (1.0 = no change, 1.2 = 20% boost).
 */
export interface ResearchBonuses {
  attackBonus?: number; // Multiplier for attack damage
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
 */
export const RESEARCH_DEFINITIONS: Record<ResearchType, ResearchDefinition> = {
  [ResearchType.InfantryImprovements]: {
    type: ResearchType.InfantryImprovements,
    name: "Infantry Improvements",
    description: "Basic military training improvements. No immediate bonus.",
    cost: 500_000n,
    durationTicks: 30 * 10, // 30 seconds
    prerequisites: [],
    bonuses: {
      // No bonus - this is the prerequisite for better tech
    },
  },

  [ResearchType.BetterTech]: {
    type: ResearchType.BetterTech,
    name: "Better Tech",
    description: "Advanced military technology. +20% attack bonus.",
    cost: 1_000_000n,
    durationTicks: 60 * 10, // 60 seconds
    prerequisites: [ResearchType.InfantryImprovements],
    bonuses: {
      attackBonus: 1.2, // 20% attack bonus
    },
  },
};

/**
 * Get the definition for a research type.
 */
export function getResearchDefinition(type: ResearchType): ResearchDefinition {
  return RESEARCH_DEFINITIONS[type];
}

/**
 * Get all research types in order for display.
 */
export function getAllResearchTypes(): ResearchType[] {
  return Object.values(ResearchType);
}

/**
 * Calculate combined bonuses from multiple completed researches.
 */
export function calculateCombinedBonuses(
  completedResearches: ResearchType[],
): ResearchBonuses {
  const combined: ResearchBonuses = {
    attackBonus: 1.0,
    defenseBonus: 1.0,
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
