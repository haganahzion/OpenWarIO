import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameView, PlayerView } from "../../../core/game/GameView";
import {
  getAllResearchTypes,
  getResearchDefinition,
  ResearchType,
} from "../../../core/game/Research";
import { SendResearchIntentEvent } from "../../Transport";
import { renderNumber } from "../../Utils";
import { Layer } from "./Layer";

@customElement("research-panel")
export class ResearchPanel extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  @state()
  private isOpen = false;

  @state()
  private myPlayer: PlayerView | null = null;

  createRenderRoot() {
    return this;
  }

  init() {
    // Initialize myPlayer on startup
    if (this.game) {
      this.myPlayer = this.game.myPlayer();
    }
    this.requestUpdate();
  }

  tick() {
    if (!this.game) return;

    const player = this.game.myPlayer();
    if (player !== this.myPlayer) {
      this.myPlayer = player;
      this.requestUpdate();
    } else if (player) {
      // Always update to reflect research progress and gold changes
      this.requestUpdate();
    }
  }

  private togglePanel(): void {
    this.isOpen = !this.isOpen;
    this.requestUpdate();
  }

  private startResearch(type: ResearchType): void {
    if (this.myPlayer && this.eventBus && this.myPlayer.canStartResearch(type)) {
      this.eventBus.emit(new SendResearchIntentEvent(type));
    }
  }

  private getResearchStatus(type: ResearchType): "completed" | "available" | "locked" | "in_progress" {
    if (!this.myPlayer) return "locked";

    if (this.myPlayer.hasResearch(type)) {
      return "completed";
    }

    if (this.myPlayer.getCurrentResearch() === type) {
      return "in_progress";
    }

    if (this.myPlayer.canStartResearch(type)) {
      return "available";
    }

    return "locked";
  }

  private renderResearchItem(type: ResearchType) {
    const def = getResearchDefinition(type);
    const status = this.getResearchStatus(type);
    const progress = this.myPlayer?.getCurrentResearch() === type
      ? this.myPlayer.getResearchProgress()
      : 0;

    const statusClasses = {
      completed: "bg-green-900/50 border-green-500",
      available: "bg-blue-900/50 border-blue-500 cursor-pointer hover:bg-blue-800/50",
      locked: "bg-gray-900/50 border-gray-600 opacity-60",
      in_progress: "bg-yellow-900/50 border-yellow-500",
    };

    const statusText = {
      completed: "Completed",
      available: `Cost: ${renderNumber(def.cost)}`,
      locked: this.getLockedReason(type),
      in_progress: `${Math.round(progress * 100)}%`,
    };

    return html`
      <div
        class=${`p-3 rounded-lg border-2 mb-2 ${statusClasses[status]}`}
        @click=${status === "available" ? () => this.startResearch(type) : null}
      >
        <div class="flex justify-between items-center">
          <div class="font-bold text-white">${def.name}</div>
          <div class="text-sm ${status === "completed" ? "text-green-400" : status === "in_progress" ? "text-yellow-400" : "text-gray-400"}">
            ${statusText[status]}
          </div>
        </div>
        <div class="text-sm text-gray-300 mt-1">${def.description}</div>
        ${status === "in_progress" ? html`
          <div class="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-yellow-500 transition-all duration-200"
              style="width: ${progress * 100}%"
            ></div>
          </div>
        ` : null}
        ${def.prerequisites.length > 0 && status === "locked" ? html`
          <div class="text-xs text-gray-500 mt-1">
            Requires: ${def.prerequisites.map(p => getResearchDefinition(p).name).join(", ")}
          </div>
        ` : null}
      </div>
    `;
  }

  private getLockedReason(type: ResearchType): string {
    if (!this.myPlayer) return "Not available";

    const def = getResearchDefinition(type);

    // Check prerequisites
    for (const prereq of def.prerequisites) {
      if (!this.myPlayer.hasResearch(prereq)) {
        return `Requires ${getResearchDefinition(prereq).name}`;
      }
    }

    // Check if already researching something
    if (this.myPlayer.getCurrentResearch() !== null) {
      return "Research in progress";
    }

    // Check cost
    if (this.myPlayer.gold() < def.cost) {
      return `Need ${renderNumber(def.cost)} gold`;
    }

    return "Locked";
  }

  private renderBonuses() {
    if (!this.myPlayer) return null;

    const bonuses = this.myPlayer.getResearchBonuses();
    if (!bonuses) return null;

    const hasBonuses = (bonuses.attackBonus ?? 1.0) !== 1.0 ||
                       (bonuses.defenseBonus ?? 1.0) !== 1.0 ||
                       (bonuses.troopProductionBonus ?? 1.0) !== 1.0;

    if (!hasBonuses) return null;

    return html`
      <div class="mt-3 p-2 bg-green-900/30 rounded border border-green-700">
        <div class="text-sm font-bold text-green-400 mb-1">Active Bonuses</div>
        ${(bonuses.attackBonus ?? 1.0) !== 1.0 ? html`
          <div class="text-xs text-green-300">Attack: +${Math.round(((bonuses.attackBonus ?? 1.0) - 1) * 100)}%</div>
        ` : null}
        ${(bonuses.defenseBonus ?? 1.0) !== 1.0 ? html`
          <div class="text-xs text-green-300">Defense: +${Math.round(((bonuses.defenseBonus ?? 1.0) - 1) * 100)}%</div>
        ` : null}
        ${(bonuses.troopProductionBonus ?? 1.0) !== 1.0 ? html`
          <div class="text-xs text-green-300">Troops: +${Math.round(((bonuses.troopProductionBonus ?? 1.0) - 1) * 100)}%</div>
        ` : null}
      </div>
    `;
  }

  render() {
    // Always render the button, but disable functionality if not ready
    const isReady = this.game && this.myPlayer?.isAlive();
    const allResearches = isReady ? getAllResearchTypes() : [];
    const currentResearch = this.myPlayer?.getCurrentResearch();

    return html`
      <div class="fixed bottom-52 left-4 z-[1000] pointer-events-auto">
        <!-- Toggle Button -->
        <button
          class=${`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all ${
            !isReady
              ? "bg-gray-700/50 text-gray-400 cursor-not-allowed"
              : this.isOpen
                ? "bg-purple-700 text-white"
                : "bg-slate-800/80 text-white hover:bg-slate-700/80"
          }`}
          @click=${isReady ? this.togglePanel : null}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span class="text-sm font-semibold">Research</span>
          ${currentResearch ? html`
            <span class="ml-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          ` : null}
        </button>

        <!-- Research Panel -->
        ${this.isOpen && isReady ? html`
          <div class="absolute top-12 left-0 w-80 max-h-96 overflow-y-auto bg-slate-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-slate-700 p-3">
            <div class="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Research Tree
            </div>

            ${allResearches.map(type => this.renderResearchItem(type))}

            ${this.renderBonuses()}
          </div>
        ` : null}
      </div>
    `;
  }
}
