import { html, LitElement } from "lit";
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

  private formatDuration(ticks: number): string {
    const seconds = ticks / 10;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }

  private renderTechNode(type: ResearchType, isLast: boolean) {
    const def = getResearchDefinition(type);
    const status = this.getResearchStatus(type);
    const progress = this.myPlayer?.getCurrentResearch() === type
      ? this.myPlayer.getResearchProgress()
      : 0;

    const nodeColors = {
      completed: "bg-green-800 border-green-400",
      available: "bg-blue-800 border-blue-400 cursor-pointer hover:bg-blue-700",
      locked: "bg-gray-800 border-gray-600 opacity-50",
      in_progress: "bg-yellow-800 border-yellow-400",
    };

    const textColors = {
      completed: "text-green-400",
      available: "text-blue-400",
      locked: "text-gray-500",
      in_progress: "text-yellow-400",
    };

    return html`
      <div class="flex items-center flex-shrink-0">
        <!-- Tech Node -->
        <div
          class=${`w-44 p-3 rounded-lg border-2 ${nodeColors[status]} transition-all`}
          @click=${status === "available" ? () => this.startResearch(type) : null}
        >
          <!-- Order number -->
          <div class="text-xs ${textColors[status]} mb-1">#${def.order}</div>

          <!-- Name -->
          <div class="font-bold text-white text-sm mb-1 leading-tight">${def.name}</div>

          <!-- Description/Bonus -->
          <div class="text-xs text-gray-300 mb-2">${def.description}</div>

          <!-- Cost & Time -->
          <div class="text-xs text-gray-400 mb-1">
            <span class="text-yellow-400">${renderNumber(def.cost)}</span> · ${this.formatDuration(def.durationTicks)}
          </div>

          <!-- Status -->
          ${status === "completed" ? html`
            <div class="text-xs text-green-400 font-semibold">✓ Completed</div>
          ` : status === "in_progress" ? html`
            <div class="mt-2">
              <div class="text-xs text-yellow-400 mb-1">${Math.round(progress * 100)}%</div>
              <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-yellow-500 transition-all duration-200"
                  style="width: ${progress * 100}%"
                ></div>
              </div>
            </div>
          ` : status === "available" ? html`
            <div class="text-xs text-blue-400 font-semibold">Click to Research</div>
          ` : html`
            <div class="text-xs text-gray-500">${this.getLockedReason(type)}</div>
          `}
        </div>

        <!-- Connector Arrow (except for last item) -->
        ${!isLast ? html`
          <div class="flex items-center mx-2 flex-shrink-0">
            <div class="w-8 h-0.5 bg-gray-600"></div>
            <div class="w-0 h-0 border-t-4 border-b-4 border-l-6 border-t-transparent border-b-transparent border-l-gray-600"></div>
          </div>
        ` : null}
      </div>
    `;
  }

  private getLockedReason(type: ResearchType): string {
    if (!this.myPlayer) return "Not available";

    const def = getResearchDefinition(type);

    for (const prereq of def.prerequisites) {
      if (!this.myPlayer.hasResearch(prereq)) {
        return `Needs: ${getResearchDefinition(prereq).name}`;
      }
    }

    if (this.myPlayer.getCurrentResearch() !== null) {
      return "Research in progress";
    }

    if (this.myPlayer.gold() < def.cost) {
      return `Need ${renderNumber(def.cost)}`;
    }

    return "Locked";
  }

  private renderBonuses() {
    if (!this.myPlayer) return null;

    const bonuses = this.myPlayer.getResearchBonuses();
    if (!bonuses) return null;

    const hasBonuses = (bonuses.attackBonus ?? 1.0) !== 1.0 ||
                       (bonuses.healthBonus ?? 1.0) !== 1.0 ||
                       (bonuses.damageReduction ?? 0) > 0;

    if (!hasBonuses) return null;

    return html`
      <div class="mt-4 p-3 bg-green-900/30 rounded-lg border border-green-700">
        <div class="text-sm font-bold text-green-400 mb-2">Active Bonuses</div>
        <div class="flex flex-wrap gap-3">
          ${(bonuses.attackBonus ?? 1.0) !== 1.0 ? html`
            <div class="text-xs text-green-300 bg-green-900/50 px-2 py-1 rounded">
              Attack: +${Math.round(((bonuses.attackBonus ?? 1.0) - 1) * 100)}%
            </div>
          ` : null}
          ${(bonuses.healthBonus ?? 1.0) !== 1.0 ? html`
            <div class="text-xs text-green-300 bg-green-900/50 px-2 py-1 rounded">
              Health: +${Math.round(((bonuses.healthBonus ?? 1.0) - 1) * 100)}%
            </div>
          ` : null}
          ${(bonuses.damageReduction ?? 0) > 0 ? html`
            <div class="text-xs text-green-300 bg-green-900/50 px-2 py-1 rounded">
              Damage Taken: -${bonuses.damageReduction}%
            </div>
          ` : null}
        </div>
      </div>
    `;
  }

  render() {
    // Only show when player is alive AND not in spawn phase
    const isInGame = this.game && this.myPlayer?.isAlive() && !this.game.inSpawnPhase();

    if (!isInGame) {
      return null; // Hide completely until player is in game
    }

    const allResearches = getAllResearchTypes();
    const currentResearch = this.myPlayer?.getCurrentResearch();

    return html`
      <!-- Toggle Button -->
      <div class="fixed bottom-52 left-4 z-[1000] pointer-events-auto">
        <button
          class=${`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all ${
            this.isOpen
              ? "bg-purple-700 text-white"
              : "bg-slate-800/80 text-white hover:bg-slate-700/80"
          }`}
          @click=${this.togglePanel}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span class="text-sm font-semibold">Research</span>
          ${currentResearch ? html`
            <span class="ml-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          ` : null}
        </button>
      </div>

      <!-- Research Panel - Centered Modal -->
      ${this.isOpen ? html`
        <div class="fixed inset-0 z-[1001] flex items-center justify-center pointer-events-none">
          <div class="w-[90vw] max-w-5xl max-h-[85vh] bg-slate-900/95 backdrop-blur-sm rounded-lg shadow-2xl border border-slate-700 pointer-events-auto flex flex-col">
            <!-- Header -->
            <div class="flex justify-between items-center p-4 border-b border-slate-700">
              <div class="text-lg font-bold text-white flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Research Tree
              </div>
              <button
                class="text-gray-400 hover:text-white transition-colors p-1"
                @click=${this.togglePanel}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Scrollable Tech Tree -->
            <div class="flex-1 overflow-auto p-4">
              <!-- Horizontal scrollable container -->
              <div class="overflow-x-auto overflow-y-auto pb-4">
                <div class="flex items-center min-w-max py-2">
                  ${allResearches.map((type, index) =>
                    this.renderTechNode(type, index === allResearches.length - 1)
                  )}
                </div>
              </div>

              <!-- Active Bonuses -->
              ${this.renderBonuses()}
            </div>
          </div>
        </div>
      ` : null}
    `;
  }
}
