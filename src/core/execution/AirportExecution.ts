import { Execution, Game, Unit } from "../game/Game";

export class AirportExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(private airport: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.airport.isActive()) {
      this.active = false;
      return;
    }

    if (this.airport.isUnderConstruction()) {
      return;
    }

    // Airport behavior will be handled here
    // For now, it's a passive structure that enables paratrooper drops
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
