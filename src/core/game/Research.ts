/**
 * Research System - Technology Tree
 *
 * This module defines the research tree structure and research types
 * for the country management system.
 */

export enum ResearchId {
  // Army Improvements Branch
  ArmyImprovements = "army_improvements",
  StrongerInfantry = "stronger_infantry",
  Exoskeleton = "exoskeleton",
}

export enum ResearchBranch {
  Army = "army",
}

export interface ResearchBonus {
  troopAttack?: number;
  troopDefense?: number;
  goldIncome?: number;
  troopIncome?: number;
  maxTroops?: number;
}

export interface ResearchNode {
  id: ResearchId;
  name: string;
  description: string;
  branch: ResearchBranch;
  cost: number;
  prerequisites: ResearchId[];
  bonus: ResearchBonus;
  icon: string;
}

export const RESEARCH_TREE: Record<ResearchId, ResearchNode> = {
  [ResearchId.ArmyImprovements]: {
    id: ResearchId.ArmyImprovements,
    name: "Army Improvements",
    description: "Unlocks advanced military technologies",
    branch: ResearchBranch.Army,
    cost: 500,
    prerequisites: [],
    bonus: {},
    icon: "⚔️",
  },
  [ResearchId.StrongerInfantry]: {
    id: ResearchId.StrongerInfantry,
    name: "Stronger Infantry",
    description: "Troop Attack Strength +20",
    branch: ResearchBranch.Army,
    cost: 1000,
    prerequisites: [ResearchId.ArmyImprovements],
    bonus: {
      troopAttack: 20,
    },
    icon: "🗡️",
  },
  [ResearchId.Exoskeleton]: {
    id: ResearchId.Exoskeleton,
    name: "Exoskeleton",
    description: "Troop Defense +50",
    branch: ResearchBranch.Army,
    cost: 2000,
    prerequisites: [ResearchId.StrongerInfantry],
    bonus: {
      troopDefense: 50,
    },
    icon: "🛡️",
  },
};

export function getResearchNode(id: ResearchId): ResearchNode {
  return RESEARCH_TREE[id];
}

export function getResearchesByBranch(branch: ResearchBranch): ResearchNode[] {
  return Object.values(RESEARCH_TREE).filter((r) => r.branch === branch);
}

export function canResearch(
  researchId: ResearchId,
  completedResearch: Set<ResearchId>,
  gold: bigint,
): boolean {
  const node = getResearchNode(researchId);
  if (completedResearch.has(researchId)) {
    return false;
  }
  if (gold < BigInt(node.cost)) {
    return false;
  }
  for (const prereq of node.prerequisites) {
    if (!completedResearch.has(prereq)) {
      return false;
    }
  }
  return true;
}

export function calculateTotalBonuses(
  completedResearch: Set<ResearchId>,
): ResearchBonus {
  const total: ResearchBonus = {
    troopAttack: 0,
    troopDefense: 0,
    goldIncome: 0,
    troopIncome: 0,
    maxTroops: 0,
  };

  for (const researchId of completedResearch) {
    const node = getResearchNode(researchId);
    if (node.bonus.troopAttack) total.troopAttack! += node.bonus.troopAttack;
    if (node.bonus.troopDefense) total.troopDefense! += node.bonus.troopDefense;
    if (node.bonus.goldIncome) total.goldIncome! += node.bonus.goldIncome;
    if (node.bonus.troopIncome) total.troopIncome! += node.bonus.troopIncome;
    if (node.bonus.maxTroops) total.maxTroops! += node.bonus.maxTroops;
  }

  return total;
}
