import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Gold } from "../../../core/game/Game";
import { GameView, PlayerView } from "../../../core/game/GameView";
import {
  calculateTotalBonuses,
  canResearch,
  getResearchesByBranch,
  ResearchBranch,
  ResearchBonus,
  ResearchId,
  ResearchNode,
  RESEARCH_TREE,
} from "../../../core/game/Research";
import { renderNumber, translateText } from "../../Utils";
import { Layer } from "./Layer";

export class ShowCountryManagementModalEvent {
  constructor(public readonly isVisible: boolean = true) {}
}

export class ResearchCompleteEvent {
  constructor(public readonly researchId: ResearchId) {}
}

type TabType = "research" | "overview";

@customElement("country-management-modal")
export class CountryManagementModal extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;

  @state()
  private isVisible: boolean = false;

  @state()
  private activeTab: TabType = "research";

  @state()
  private completedResearch: Set<ResearchId> = new Set();

  @state()
  private selectedResearch: ResearchId | null = null;

  createRenderRoot() {
    return this;
  }

  init() {
    this.eventBus.on(ShowCountryManagementModalEvent, (event) => {
      this.isVisible = event.isVisible;
      if (this.isVisible) {
        this.loadResearchState();
      }
      this.requestUpdate();
    });
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
    this.loadResearchState();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.isVisible && event.key === "Escape") {
      this.closeModal();
    }
  };

  private loadResearchState() {
    const saved = localStorage.getItem("research_completed");
    if (saved) {
      try {
        const arr = JSON.parse(saved) as ResearchId[];
        this.completedResearch = new Set(arr);
      } catch {
        this.completedResearch = new Set();
      }
    }
  }

  private saveResearchState() {
    localStorage.setItem(
      "research_completed",
      JSON.stringify([...this.completedResearch]),
    );
  }

  public openModal() {
    this.isVisible = true;
    this.loadResearchState();
    this.requestUpdate();
  }

  public closeModal() {
    this.isVisible = false;
    this.selectedResearch = null;
    this.requestUpdate();
  }

  private handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("modal-overlay")) {
      this.closeModal();
    }
  };

  private setTab(tab: TabType) {
    this.activeTab = tab;
    this.selectedResearch = null;
    this.requestUpdate();
  }

  private selectResearch(researchId: ResearchId) {
    this.selectedResearch = researchId;
    this.requestUpdate();
  }

  private purchaseResearch(researchId: ResearchId) {
    const player = this.game?.myPlayer();
    if (!player) return;

    const gold = player.gold();
    if (!canResearch(researchId, this.completedResearch, gold)) {
      return;
    }

    // In a full implementation, this would send an intent to the server
    // For now, we'll store it locally and emit an event
    this.completedResearch.add(researchId);
    this.saveResearchState();
    this.eventBus.emit(new ResearchCompleteEvent(researchId));
    this.requestUpdate();
  }

  private getPlayerGold(): Gold {
    return this.game?.myPlayer()?.gold() ?? 0n;
  }

  private getTotalBonuses(): ResearchBonus {
    return calculateTotalBonuses(this.completedResearch);
  }

  private renderTabs() {
    return html`
      <div class="flex border-b border-slate-600">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors ${this
            .activeTab === "research"
            ? "text-white border-b-2 border-blue-500 bg-slate-700/50"
            : "text-slate-400 hover:text-white hover:bg-slate-700/30"}"
          @click=${() => this.setTab("research")}
        >
          Research
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors ${this
            .activeTab === "overview"
            ? "text-white border-b-2 border-blue-500 bg-slate-700/50"
            : "text-slate-400 hover:text-white hover:bg-slate-700/30"}"
          @click=${() => this.setTab("overview")}
        >
          Overview
        </button>
      </div>
    `;
  }

  private renderResearchNode(node: ResearchNode, index: number) {
    const isCompleted = this.completedResearch.has(node.id);
    const canPurchase = canResearch(
      node.id,
      this.completedResearch,
      this.getPlayerGold(),
    );
    const isSelected = this.selectedResearch === node.id;

    const prereqsMet = node.prerequisites.every((p) =>
      this.completedResearch.has(p),
    );
    const isLocked = !prereqsMet && !isCompleted;

    return html`
      <div class="relative flex flex-col items-center">
        <!-- Connection line to parent -->
        ${index > 0
          ? html`
              <div
                class="absolute -top-6 left-1/2 w-0.5 h-6 ${isLocked
                  ? "bg-slate-600"
                  : "bg-blue-500"}"
              ></div>
            `
          : ""}

        <!-- Research node -->
        <button
          class="relative flex flex-col items-center justify-center w-24 h-24 rounded-lg border-2 transition-all ${isCompleted
            ? "bg-emerald-900/50 border-emerald-500 shadow-emerald-500/30 shadow-lg"
            : isLocked
              ? "bg-slate-800/50 border-slate-600 opacity-50 cursor-not-allowed"
              : isSelected
                ? "bg-blue-900/50 border-blue-400 shadow-blue-400/30 shadow-lg"
                : canPurchase
                  ? "bg-slate-700/50 border-slate-500 hover:border-blue-400 hover:bg-slate-700"
                  : "bg-slate-800/50 border-slate-600"}"
          @click=${() => !isLocked && this.selectResearch(node.id)}
          ?disabled=${isLocked}
        >
          <span class="text-2xl mb-1">${node.icon}</span>
          <span
            class="text-xs text-center px-1 font-medium ${isCompleted
              ? "text-emerald-300"
              : isLocked
                ? "text-slate-500"
                : "text-white"}"
          >
            ${node.name}
          </span>

          <!-- Completed checkmark -->
          ${isCompleted
            ? html`
                <div
                  class="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center"
                >
                  <span class="text-white text-xs">✓</span>
                </div>
              `
            : ""}

          <!-- Locked icon -->
          ${isLocked
            ? html`
                <div
                  class="absolute -top-2 -right-2 w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center"
                >
                  <span class="text-slate-400 text-xs">🔒</span>
                </div>
              `
            : ""}
        </button>
      </div>
    `;
  }

  private renderResearchTree() {
    const armyResearch = getResearchesByBranch(ResearchBranch.Army);

    return html`
      <div class="p-4">
        <!-- Army Branch -->
        <div class="mb-8">
          <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>⚔️</span>
            <span>Army Improvements</span>
          </h3>

          <div class="flex flex-col items-center gap-6">
            ${armyResearch.map((node, index) =>
              this.renderResearchNode(node, index),
            )}
          </div>
        </div>
      </div>
    `;
  }

  private renderSelectedResearchDetails() {
    if (!this.selectedResearch) {
      return html`
        <div
          class="p-4 bg-slate-800/50 rounded-lg text-center text-slate-400 text-sm"
        >
          Select a research to view details
        </div>
      `;
    }

    const node = RESEARCH_TREE[this.selectedResearch];
    const isCompleted = this.completedResearch.has(node.id);
    const canPurchase = canResearch(
      node.id,
      this.completedResearch,
      this.getPlayerGold(),
    );
    const gold = this.getPlayerGold();

    return html`
      <div class="p-4 bg-slate-800/50 rounded-lg">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-3xl">${node.icon}</span>
          <div>
            <h4 class="text-lg font-bold text-white">${node.name}</h4>
            <p class="text-sm text-slate-400">${node.description}</p>
          </div>
        </div>

        <!-- Bonuses -->
        ${Object.entries(node.bonus).length > 0
          ? html`
              <div class="mb-4">
                <h5 class="text-sm font-semibold text-slate-300 mb-2">
                  Bonuses:
                </h5>
                <ul class="text-sm text-emerald-400 space-y-1">
                  ${node.bonus.troopAttack
                    ? html`<li>+${node.bonus.troopAttack} Troop Attack</li>`
                    : ""}
                  ${node.bonus.troopDefense
                    ? html`<li>+${node.bonus.troopDefense} Troop Defense</li>`
                    : ""}
                  ${node.bonus.goldIncome
                    ? html`<li>+${node.bonus.goldIncome} Gold Income</li>`
                    : ""}
                  ${node.bonus.troopIncome
                    ? html`<li>+${node.bonus.troopIncome} Troop Income</li>`
                    : ""}
                  ${node.bonus.maxTroops
                    ? html`<li>+${node.bonus.maxTroops} Max Troops</li>`
                    : ""}
                </ul>
              </div>
            `
          : ""}

        <!-- Cost and action -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-yellow-500">💰</span>
            <span
              class="font-bold ${gold >= BigInt(node.cost)
                ? "text-white"
                : "text-red-400"}"
            >
              ${renderNumber(BigInt(node.cost))}
            </span>
          </div>

          ${isCompleted
            ? html`
                <span
                  class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold"
                >
                  Researched ✓
                </span>
              `
            : html`
                <button
                  class="px-4 py-2 rounded-lg font-semibold transition-colors ${canPurchase
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "bg-slate-600 text-slate-400 cursor-not-allowed"}"
                  @click=${() =>
                    canPurchase && this.purchaseResearch(node.id)}
                  ?disabled=${!canPurchase}
                >
                  ${canPurchase ? "Research" : "Cannot Research"}
                </button>
              `}
        </div>
      </div>
    `;
  }

  private renderResearchTab() {
    return html`
      <div class="flex flex-col lg:flex-row gap-4 p-4 h-full overflow-auto">
        <!-- Research Tree -->
        <div class="flex-1 overflow-auto">${this.renderResearchTree()}</div>

        <!-- Details Panel -->
        <div class="lg:w-72 flex-shrink-0">
          <h3 class="text-sm font-semibold text-slate-400 mb-2 uppercase">
            Research Details
          </h3>
          ${this.renderSelectedResearchDetails()}

          <!-- Current Bonuses Summary -->
          <div class="mt-4 p-4 bg-slate-800/50 rounded-lg">
            <h4 class="text-sm font-semibold text-slate-400 mb-2 uppercase">
              Active Bonuses
            </h4>
            ${this.renderBonusSummary()}
          </div>
        </div>
      </div>
    `;
  }

  private renderBonusSummary() {
    const bonuses = this.getTotalBonuses();
    const hasAnyBonus =
      (bonuses.troopAttack ?? 0) > 0 ||
      (bonuses.troopDefense ?? 0) > 0 ||
      (bonuses.goldIncome ?? 0) > 0 ||
      (bonuses.troopIncome ?? 0) > 0 ||
      (bonuses.maxTroops ?? 0) > 0;

    if (!hasAnyBonus) {
      return html`
        <p class="text-sm text-slate-500">No active research bonuses</p>
      `;
    }

    return html`
      <ul class="text-sm space-y-1">
        ${(bonuses.troopAttack ?? 0) > 0
          ? html`<li class="text-emerald-400">
              +${bonuses.troopAttack} Troop Attack
            </li>`
          : ""}
        ${(bonuses.troopDefense ?? 0) > 0
          ? html`<li class="text-emerald-400">
              +${bonuses.troopDefense} Troop Defense
            </li>`
          : ""}
        ${(bonuses.goldIncome ?? 0) > 0
          ? html`<li class="text-emerald-400">
              +${bonuses.goldIncome} Gold Income
            </li>`
          : ""}
        ${(bonuses.troopIncome ?? 0) > 0
          ? html`<li class="text-emerald-400">
              +${bonuses.troopIncome} Troop Income
            </li>`
          : ""}
        ${(bonuses.maxTroops ?? 0) > 0
          ? html`<li class="text-emerald-400">
              +${bonuses.maxTroops} Max Troops
            </li>`
          : ""}
      </ul>
    `;
  }

  private renderOverviewTab() {
    const player = this.game?.myPlayer();
    const completedCount = this.completedResearch.size;
    const totalCount = Object.keys(RESEARCH_TREE).length;

    return html`
      <div class="p-4 space-y-4">
        <!-- Country Stats -->
        <div class="bg-slate-800/50 rounded-lg p-4">
          <h3 class="text-lg font-bold text-white mb-3">Country Statistics</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-slate-400">Gold:</span>
              <span class="text-yellow-400 font-bold ml-2">
                💰 ${player ? renderNumber(player.gold()) : "0"}
              </span>
            </div>
            <div>
              <span class="text-slate-400">Troops:</span>
              <span class="text-blue-400 font-bold ml-2">
                🛡️ ${player?.troops() ?? 0}
              </span>
            </div>
          </div>
        </div>

        <!-- Research Progress -->
        <div class="bg-slate-800/50 rounded-lg p-4">
          <h3 class="text-lg font-bold text-white mb-3">Research Progress</h3>
          <div class="mb-3">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-400">Completed</span>
              <span class="text-white font-bold"
                >${completedCount} / ${totalCount}</span
              >
            </div>
            <div class="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-emerald-500 transition-all"
                style="width: ${(completedCount / totalCount) * 100}%"
              ></div>
            </div>
          </div>

          <!-- Completed Research List -->
          ${completedCount > 0
            ? html`
                <div class="mt-4">
                  <h4 class="text-sm font-semibold text-slate-400 mb-2">
                    Completed Research:
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    ${[...this.completedResearch].map((id) => {
                      const node = RESEARCH_TREE[id];
                      return html`
                        <span
                          class="px-2 py-1 bg-emerald-900/50 border border-emerald-500/30 rounded text-emerald-300 text-xs"
                        >
                          ${node.icon} ${node.name}
                        </span>
                      `;
                    })}
                  </div>
                </div>
              `
            : ""}
        </div>

        <!-- Active Bonuses -->
        <div class="bg-slate-800/50 rounded-lg p-4">
          <h3 class="text-lg font-bold text-white mb-3">Active Bonuses</h3>
          ${this.renderBonusSummary()}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.isVisible) {
      return null;
    }

    return html`
      <div
        class="modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs z-2000 flex items-center justify-center p-4"
        @click=${this.handleOutsideClick}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div
          class="bg-slate-800 border border-slate-600 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between p-4 border-b border-slate-600 flex-shrink-0"
          >
            <div class="flex items-center gap-2">
              <span class="text-2xl">🏛️</span>
              <h2 class="text-xl font-semibold text-white">
                Country Management
              </h2>
            </div>
            <button
              class="text-slate-400 hover:text-white text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-700"
              @click=${() => this.closeModal()}
            >
              ×
            </button>
          </div>

          <!-- Tabs -->
          ${this.renderTabs()}

          <!-- Content -->
          <div class="flex-1 overflow-auto">
            ${this.activeTab === "research"
              ? this.renderResearchTab()
              : this.renderOverviewTab()}
          </div>
        </div>
      </div>
    `;
  }
}
