import { renderTroops } from "../../client/Utils";
import {
  Execution,
  Game,
  MessageType,
  Player,
  TerraNullius,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AttackExecution } from "./AttackExecution";

export class TransportPlaneExecution implements Execution {
  private active = true;

  private ticksPerMove = 2; // Plane moves every 2 ticks
  private lastMove: number;

  private mg: Game;
  private target: Player | TerraNullius;

  private dst: TileRef;
  private src: TileRef;
  private plane: Unit;

  private pathTiles: TileRef[] = [];
  private pathIndex = 0;

  constructor(
    private attacker: Player,
    private dstTile: TileRef,
    private troops: number,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    if (!mg.isValidRef(this.dstTile)) {
      console.warn(`TransportPlaneExecution: dstTile ${this.dstTile} not valid`);
      this.active = false;
      return;
    }

    this.lastMove = ticks;
    this.mg = mg;
    this.target = mg.owner(this.dstTile);

    // Check if player has an airport
    const airports = this.attacker.units(UnitType.Airport);
    if (airports.length === 0) {
      mg.displayMessage(
        "events_display.no_airport",
        MessageType.ATTACK_FAILED,
        this.attacker.id(),
      );
      this.active = false;
      return;
    }

    // Can only attack enemy territory
    if (this.target.isPlayer()) {
      if (this.attacker.isOnSameTeam(this.target)) {
        this.active = false;
        return;
      }
      if (!this.attacker.canAttackPlayer(this.target)) {
        this.active = false;
        return;
      }
    }

    // Find closest airport
    let closestAirport: Unit | null = null;
    let closestDist = Infinity;
    const map = mg.map();
    const dstX = map.x(this.dstTile);
    const dstY = map.y(this.dstTile);

    for (const airport of airports) {
      if (airport.isUnderConstruction()) continue;
      const airportX = map.x(airport.tile());
      const airportY = map.y(airport.tile());
      const dist = Math.sqrt(
        Math.pow(dstX - airportX, 2) + Math.pow(dstY - airportY, 2),
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestAirport = airport;
      }
    }

    if (closestAirport === null) {
      console.warn(`TransportPlaneExecution: no available airport found`);
      this.active = false;
      return;
    }

    this.src = closestAirport.tile();
    this.dst = this.dstTile;

    // Limit troops to what player has
    this.troops = Math.min(this.troops, this.attacker.troops());
    if (this.troops <= 0) {
      this.active = false;
      return;
    }

    // Deduct troops from player
    this.attacker.addTroops(-this.troops);

    // Calculate path (straight line from src to dst)
    this.pathTiles = this.calculatePath(this.src, this.dst);

    // Create the plane unit at source
    this.plane = this.attacker.buildUnit(UnitType.TransportPlane, this.src, {
      troops: this.troops,
      targetTile: this.dst,
      sourceTile: this.src,
    });

    // Notify the target player about incoming airdrop
    if (this.target.isPlayer()) {
      mg.displayIncomingUnit(
        this.plane.id(),
        `Paratrooper drop incoming from ${this.attacker.displayName()}`,
        MessageType.NAVAL_INVASION_INBOUND, // Reuse naval invasion message type
        this.target.id(),
      );
    }
  }

  private calculatePath(src: TileRef, dst: TileRef): TileRef[] {
    const map = this.mg.map();
    const srcX = map.x(src);
    const srcY = map.y(src);
    const dstX = map.x(dst);
    const dstY = map.y(dst);

    const tiles: TileRef[] = [];
    const dist = Math.sqrt(
      Math.pow(dstX - srcX, 2) + Math.pow(dstY - srcY, 2),
    );
    const steps = Math.ceil(dist / 3); // Move ~3 tiles per step

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(srcX + (dstX - srcX) * t);
      const y = Math.round(srcY + (dstY - srcY) * t);
      if (map.isValidCoord(x, y)) {
        tiles.push(map.ref(x, y));
      }
    }

    // Ensure destination is included
    if (tiles.length === 0 || tiles[tiles.length - 1] !== dst) {
      tiles.push(dst);
    }

    return tiles;
  }

  tick(ticks: number) {
    if (!this.active) {
      return;
    }
    if (!this.plane.isActive()) {
      this.active = false;
      return;
    }
    if (ticks - this.lastMove < this.ticksPerMove) {
      return;
    }
    this.lastMove = ticks;

    // Move along path
    if (this.pathIndex < this.pathTiles.length) {
      const nextTile = this.pathTiles[this.pathIndex];
      this.plane.move(nextTile);
      this.pathIndex++;
    }

    // Check if reached destination
    if (this.pathIndex >= this.pathTiles.length) {
      this.landTroops();
    }
  }

  private landTroops() {
    // Land the troops and start attack
    const troops = this.plane.troops();

    // Delete the plane
    this.plane.delete(false);

    // Check current owner of destination tile (may have changed since init)
    const currentOwner = this.mg.owner(this.dst);

    // Check if destination is land (can only conquer land tiles)
    if (!this.mg.isLand(this.dst)) {
      // Landed on water - troops are lost
      this.active = false;
      return;
    }

    // Conquer the landing tile (exactly like boats do)
    this.attacker.conquer(this.dst);

    // Check relationship with current owner
    if (currentOwner.isPlayer() && !this.attacker.isOnSameTeam(currentOwner)) {
      // Landing on enemy territory - start an attack (exactly like boats)
      // Use removeTroops: false so the attack uses these dedicated troops
      // and spreads conquest from the landing tile
      this.mg.addExecution(
        new AttackExecution(
          troops,
          this.attacker,
          currentOwner.id(),
          this.dst,
          false, // removeTroops: false, like boats - troops dedicated to this attack
        ),
      );

      this.mg.displayMessage(
        "events_display.paratrooper_landed",
        MessageType.ATTACK_REQUEST,
        this.attacker.id(),
        undefined,
        { troops: renderTroops(troops), name: currentOwner.displayName() },
      );
    } else {
      // Landing on friendly territory or terra nullius - just add troops back
      this.attacker.addTroops(troops);
    }

    this.active = false;
  }

  owner(): Player {
    return this.attacker;
  }

  isActive(): boolean {
    return this.active;
  }
}
