import { Execution, Game, Player } from "../game/Game";
import { PlayerImpl } from "../game/PlayerImpl";
import { getResearchDefinition, ResearchType } from "../game/Research";

/**
 * Handles the research process for a player.
 * Research takes time to complete and applies bonuses when finished.
 */
export class ResearchExecution implements Execution {
  private mg: Game;
  private active = true;
  private completionTick: number | null = null;

  constructor(
    private player: Player,
    private researchType: ResearchType,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;

    // Validate player can start this research
    if (!this.player.canStartResearch(this.researchType)) {
      console.warn(
        `Player ${this.player.name()} cannot start research ${this.researchType}`,
      );
      this.active = false;
      return;
    }

    // Start the research
    const started = this.player.startResearch(this.researchType);
    if (!started) {
      console.warn(
        `Failed to start research ${this.researchType} for player ${this.player.name()}`,
      );
      this.active = false;
      return;
    }

    // Calculate when research completes
    const def = getResearchDefinition(this.researchType);
    this.completionTick = ticks + def.durationTicks;
  }

  tick(ticks: number): void {
    if (!this.active || this.completionTick === null) {
      return;
    }

    // Check if player died during research
    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }

    // Check if research is complete
    if (ticks >= this.completionTick) {
      // Complete the research
      (this.player as PlayerImpl).completeResearch();
      this.active = false;

      // Log completion
      const def = getResearchDefinition(this.researchType);
      console.log(
        `Player ${this.player.name()} completed research: ${def.name}`,
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
