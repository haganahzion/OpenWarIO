import { Execution, Game, Player } from "../game/Game";
import { ResearchState, ResearchType } from "../game/Research";

// Interface to access internal player state for admin purposes
interface PlayerWithInternals extends Player {
  _researches: Map<ResearchType, ResearchState>;
  _currentResearch: ResearchType | null;
}

export class AdminExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private player: Player,
    private action: "unlock_research" | "add_gold" | "add_troops",
    private amount?: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.active) return;

    console.log(`[AdminExecution] Executing action=${this.action}, amount=${this.amount}, player=${this.player.name()}`);

    switch (this.action) {
      case "unlock_research":
        // Unlock all research for the player by directly accessing internal state
        const playerInternal = this.player as unknown as PlayerWithInternals;
        const currentTick = this.mg.ticks();

        for (const researchType of Object.values(ResearchType)) {
          if (typeof researchType === "number") {
            const type = researchType as ResearchType;
            // Check if already researched
            const existing = playerInternal._researches.get(type);
            if (!existing || !existing.completed) {
              // Mark as completed
              playerInternal._researches.set(type, {
                type,
                completed: true,
                startedAt: currentTick,
                completedAt: currentTick,
              });
            }
          }
        }
        // Clear any current research in progress
        playerInternal._currentResearch = null;
        break;

      case "add_gold":
        if (this.amount !== undefined) {
          const goldBefore = this.player.gold();
          this.player.addGold(BigInt(this.amount));
          const goldAfter = this.player.gold();
          console.log(`[AdminExecution] add_gold: before=${goldBefore}, added=${this.amount}, after=${goldAfter}`);
        }
        break;

      case "add_troops":
        if (this.amount !== undefined) {
          const troopsBefore = this.player.troops();
          if (this.amount === -1) {
            // MAX troops - fill to max population
            const currentTroops = this.player.troops();
            const maxTroops = this.mg.config().maxTroops(this.player);
            const toAdd = maxTroops - currentTroops;
            if (toAdd > 0) {
              this.player.addTroops(toAdd);
            }
            console.log(`[AdminExecution] add_troops MAX: before=${troopsBefore}, max=${maxTroops}, added=${toAdd}, after=${this.player.troops()}`);
          } else {
            // Add specific amount, but cap at max
            const currentTroops = this.player.troops();
            const maxTroops = this.mg.config().maxTroops(this.player);
            const available = maxTroops - currentTroops;
            const toAdd = Math.min(this.amount, available);
            if (toAdd > 0) {
              this.player.addTroops(toAdd);
            }
            console.log(`[AdminExecution] add_troops: before=${troopsBefore}, requested=${this.amount}, added=${toAdd}, after=${this.player.troops()}`);
          }
        }
        break;
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
