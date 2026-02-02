import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { UserSettings } from "../../../core/game/UserSettings";
import { AlternateViewEvent, RefreshGraphicsEvent } from "../../InputHandler";
import { PauseGameIntentEvent } from "../../Transport";
import { translateText } from "../../Utils";
import SoundManager from "../../sound/SoundManager";
import { Layer } from "./Layer";
import structureIcon from "/images/CityIconWhite.svg?url";
import cursorPriceIcon from "/images/CursorPriceIconWhite.svg?url";
import darkModeIcon from "/images/DarkModeIconWhite.svg?url";
import emojiIcon from "/images/EmojiIconWhite.svg?url";
import exitIcon from "/images/ExitIconWhite.svg?url";
import explosionIcon from "/images/ExplosionIconWhite.svg?url";
import mouseIcon from "/images/MouseIconWhite.svg?url";
import ninjaIcon from "/images/NinjaIconWhite.svg?url";
import settingsIcon from "/images/SettingIconWhite.svg?url";
import sirenIcon from "/images/SirenIconWhite.svg?url";
import treeIcon from "/images/TreeIconWhite.svg?url";
import musicIcon from "/images/music.svg?url";

export class ShowSettingsModalEvent {
  constructor(
    public readonly isVisible: boolean = true,
    public readonly shouldPause: boolean = false,
    public readonly isPaused: boolean = false,
  ) {}
}

const ADMIN_CODE = "ADMIN0024430";

@customElement("settings-modal")
export class SettingsModal extends LitElement implements Layer {
  public eventBus: EventBus;
  public userSettings: UserSettings;

  @state()
  private isVisible: boolean = false;

  @state()
  private alternateView: boolean = false;

  @state()
  private adminUnlocked: boolean = false;

  @state()
  private referralCode: string = "";

  @query(".modal-overlay")
  private modalOverlay!: HTMLElement;

  @property({ type: Boolean })
  shouldPause = false;

  @property({ type: Boolean })
  wasPausedWhenOpened = false;

  init() {
    SoundManager.setBackgroundMusicVolume(
      this.userSettings.backgroundMusicVolume(),
    );
    SoundManager.setSoundEffectsVolume(this.userSettings.soundEffectsVolume());
    this.eventBus.on(ShowSettingsModalEvent, (event) => {
      this.isVisible = event.isVisible;
      this.shouldPause = event.shouldPause;
      this.wasPausedWhenOpened = event.isPaused;
      this.pauseGame(true);
    });
    // Load admin status from localStorage
    this.adminUnlocked = localStorage.getItem("admin.unlocked") === "true";
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("click", this.handleOutsideClick, true);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("click", this.handleOutsideClick, true);
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleOutsideClick = (event: MouseEvent) => {
    if (
      this.isVisible &&
      this.modalOverlay &&
      event.target === this.modalOverlay
    ) {
      this.closeModal();
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.isVisible && event.key === "Escape") {
      this.closeModal();
    }
  };

  public openModal() {
    this.isVisible = true;
    this.requestUpdate();
  }

  public closeModal() {
    this.isVisible = false;
    this.requestUpdate();
    this.pauseGame(false);
  }

  private pauseGame(pause: boolean) {
    if (this.shouldPause && !this.wasPausedWhenOpened)
      this.eventBus.emit(new PauseGameIntentEvent(pause));
  }

  private onTerrainButtonClick() {
    this.alternateView = !this.alternateView;
    this.eventBus.emit(new AlternateViewEvent(this.alternateView));
    this.requestUpdate();
  }

  private onToggleEmojisButtonClick() {
    this.userSettings.toggleEmojis();
    this.requestUpdate();
  }

  private onToggleStructureSpritesButtonClick() {
    this.userSettings.toggleStructureSprites();
    this.requestUpdate();
  }

  private onToggleSpecialEffectsButtonClick() {
    this.userSettings.toggleFxLayer();
    this.requestUpdate();
  }

  private onToggleAlertFrameButtonClick() {
    this.userSettings.toggleAlertFrame();
    this.requestUpdate();
  }

  private onToggleDarkModeButtonClick() {
    this.userSettings.toggleDarkMode();
    this.eventBus.emit(new RefreshGraphicsEvent());
    this.requestUpdate();
  }

  private onToggleRandomNameModeButtonClick() {
    this.userSettings.toggleRandomName();
    this.requestUpdate();
  }

  private onToggleLeftClickOpensMenu() {
    this.userSettings.toggleLeftClickOpenMenu();
    this.requestUpdate();
  }

  private onToggleCursorCostLabelButtonClick() {
    this.userSettings.toggleCursorCostLabel();
    this.requestUpdate();
  }

  private onTogglePerformanceOverlayButtonClick() {
    this.userSettings.togglePerformanceOverlay();
    this.requestUpdate();
  }

  private onExitButtonClick() {
    // redirect to the home page
    window.location.href = "/";
  }

  private checkReferralCode() {
    if (this.referralCode === ADMIN_CODE) {
      this.adminUnlocked = true;
      localStorage.setItem("admin.unlocked", "true");
      this.requestUpdate();
    }
    this.referralCode = "";
  }

  private adminUnlockAllResearch() {
    console.log("[SettingsModal] Unlock All Research clicked");
    window.dispatchEvent(
      new CustomEvent("admin-command", {
        detail: { type: "unlock-all-research" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private adminAddGold(amount: number) {
    console.log(`[SettingsModal] Add Gold clicked: ${amount}`);
    window.dispatchEvent(
      new CustomEvent("admin-command", {
        detail: { type: "add-gold", amount },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private adminAddTroops(amount: number) {
    console.log(`[SettingsModal] Add Troops clicked: ${amount}`);
    window.dispatchEvent(
      new CustomEvent("admin-command", {
        detail: { type: "add-troops", amount },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onVolumeChange(event: Event) {
    const volume = parseFloat((event.target as HTMLInputElement).value) / 100;
    this.userSettings.setBackgroundMusicVolume(volume);
    SoundManager.setBackgroundMusicVolume(volume);
    this.requestUpdate();
  }

  private onSoundEffectsVolumeChange(event: Event) {
    const volume = parseFloat((event.target as HTMLInputElement).value) / 100;
    this.userSettings.setSoundEffectsVolume(volume);
    SoundManager.setSoundEffectsVolume(volume);
    this.requestUpdate();
  }

  render() {
    if (!this.isVisible) {
      return null;
    }

    return html`
      <div
        class="modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs z-2000 flex items-center justify-center p-4"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div
          class="bg-slate-800 border border-slate-600 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto"
        >
          <div
            class="flex items-center justify-between p-4 border-b border-slate-600"
          >
            <div class="flex items-center gap-2">
              <img
                src=${settingsIcon}
                alt="settings"
                width="24"
                height="24"
                class="align-middle"
              />
              <h2 class="text-xl font-semibold text-white">
                ${translateText("user_setting.tab_basic")}
              </h2>
            </div>
            <button
              class="text-slate-400 hover:text-white text-2xl font-bold leading-none"
              @click=${this.closeModal}
            >
              ×
            </button>
          </div>

          <div class="p-4 flex flex-col gap-3">
            <div
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
            >
              <img src=${musicIcon} alt="musicIcon" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.background_music_volume")}
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  .value=${this.userSettings.backgroundMusicVolume() * 100}
                  @input=${this.onVolumeChange}
                  class="w-full border border-slate-500 rounded-lg"
                />
              </div>
              <div class="text-sm text-slate-400">
                ${Math.round(this.userSettings.backgroundMusicVolume() * 100)}%
              </div>
            </div>

            <div
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
            >
              <img
                src=${musicIcon}
                alt="soundEffectsIcon"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.sound_effects_volume")}
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  .value=${this.userSettings.soundEffectsVolume() * 100}
                  @input=${this.onSoundEffectsVolumeChange}
                  class="w-full border border-slate-500 rounded-lg"
                />
              </div>
              <div class="text-sm text-slate-400">
                ${Math.round(this.userSettings.soundEffectsVolume() * 100)}%
              </div>
            </div>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onTerrainButtonClick}"
            >
              <img src=${treeIcon} alt="treeIcon" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.toggle_terrain")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.toggle_view_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.alternateView
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleEmojisButtonClick}"
            >
              <img src=${emojiIcon} alt="emojiIcon" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.emojis_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.emojis_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.emojis()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleDarkModeButtonClick}"
            >
              <img
                src=${darkModeIcon}
                alt="darkModeIcon"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.dark_mode_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.dark_mode_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.darkMode()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleSpecialEffectsButtonClick}"
            >
              <img
                src=${explosionIcon}
                alt="specialEffects"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.special_effects_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.special_effects_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.fxLayer()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleAlertFrameButtonClick}"
            >
              <img src=${sirenIcon} alt="alertFrame" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.alert_frame_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.alert_frame_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.alertFrame()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleStructureSpritesButtonClick}"
            >
              <img
                src=${structureIcon}
                alt="structureSprites"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.structure_sprites_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.structure_sprites_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.structureSprites()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleCursorCostLabelButtonClick}"
            >
              <img
                src=${cursorPriceIcon}
                alt="cursorCostLabel"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.cursor_cost_label_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.cursor_cost_label_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.cursorCostLabel()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleRandomNameModeButtonClick}"
            >
              <img src=${ninjaIcon} alt="ninjaIcon" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.anonymous_names_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.anonymous_names_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.anonymousNames()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onToggleLeftClickOpensMenu}"
            >
              <img src=${mouseIcon} alt="mouseIcon" width="20" height="20" />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.left_click_menu")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.left_click_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.leftClickOpensMenu()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <button
              class="flex gap-3 items-center w-full text-left p-3 hover:bg-slate-700 rounded-sm text-white transition-colors"
              @click="${this.onTogglePerformanceOverlayButtonClick}"
            >
              <img
                src=${settingsIcon}
                alt="performanceIcon"
                width="20"
                height="20"
              />
              <div class="flex-1">
                <div class="font-medium">
                  ${translateText("user_setting.performance_overlay_label")}
                </div>
                <div class="text-sm text-slate-400">
                  ${translateText("user_setting.performance_overlay_desc")}
                </div>
              </div>
              <div class="text-sm text-slate-400">
                ${this.userSettings.performanceOverlay()
                  ? translateText("user_setting.on")
                  : translateText("user_setting.off")}
              </div>
            </button>

            <!-- Referral Code Input -->
            <div class="border-t border-slate-600 pt-3 mt-4">
              <div
                class="flex gap-3 items-center w-full p-3 text-white"
              >
                <div class="flex-1">
                  <div class="font-medium">Referral Code</div>
                  <div class="text-sm text-slate-400">Enter code to unlock special features</div>
                </div>
                <input
                  type="text"
                  class="w-24 px-2 py-1 bg-slate-700 border border-slate-500 rounded text-white text-sm"
                  placeholder="Code"
                  .value=${this.referralCode}
                  @input=${(e: Event) => {
                    this.referralCode = (e.target as HTMLInputElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      this.checkReferralCode();
                    }
                  }}
                />
                <button
                  class="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white text-sm"
                  @click=${this.checkReferralCode}
                >
                  Apply
                </button>
              </div>
            </div>

            ${this.adminUnlocked ? html`
            <!-- Admin Commands -->
            <div class="border-t border-slate-600 pt-3 mt-2">
              <div class="p-3 bg-purple-900/30 rounded-lg border border-purple-500/30">
                <div class="font-medium text-purple-300 mb-3 flex items-center gap-2">
                  <span>👑</span> Admin Commands
                </div>

                <button
                  class="w-full mb-2 px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 rounded text-purple-200 text-sm transition-colors"
                  @click=${() => this.adminUnlockAllResearch()}
                >
                  Unlock All Research
                </button>

                <div class="text-xs text-slate-400 mb-1">Add Gold</div>
                <div class="flex gap-2 mb-3">
                  <button
                    class="flex-1 px-2 py-1 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/30 rounded text-yellow-200 text-sm"
                    @click=${() => this.adminAddGold(100000)}
                  >+100K</button>
                  <button
                    class="flex-1 px-2 py-1 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/30 rounded text-yellow-200 text-sm"
                    @click=${() => this.adminAddGold(500000)}
                  >+500K</button>
                  <button
                    class="flex-1 px-2 py-1 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/30 rounded text-yellow-200 text-sm"
                    @click=${() => this.adminAddGold(1000000)}
                  >+1M</button>
                </div>

                <div class="text-xs text-slate-400 mb-1">Add Troops</div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 px-2 py-1 bg-green-600/30 hover:bg-green-600/50 border border-green-500/30 rounded text-green-200 text-sm"
                    @click=${() => this.adminAddTroops(10000)}
                  >+10K</button>
                  <button
                    class="flex-1 px-2 py-1 bg-green-600/30 hover:bg-green-600/50 border border-green-500/30 rounded text-green-200 text-sm"
                    @click=${() => this.adminAddTroops(50000)}
                  >+50K</button>
                  <button
                    class="flex-1 px-2 py-1 bg-green-600/30 hover:bg-green-600/50 border border-green-500/30 rounded text-green-200 text-sm"
                    @click=${() => this.adminAddTroops(100000)}
                  >+100K</button>
                  <button
                    class="flex-1 px-2 py-1 bg-green-600/30 hover:bg-green-600/50 border border-green-500/30 rounded text-green-200 text-sm"
                    @click=${() => this.adminAddTroops(-1)}
                  >MAX</button>
                </div>
              </div>
            </div>
            ` : null}

            <div class="border-t border-slate-600 pt-3 mt-4">
              <button
                class="flex gap-3 items-center w-full text-left p-3 hover:bg-red-600/20 rounded-sm text-red-400 transition-colors"
                @click="${this.onExitButtonClick}"
              >
                <img src=${exitIcon} alt="exitIcon" width="20" height="20" />
                <div class="flex-1">
                  <div class="font-medium">
                    ${translateText("user_setting.exit_game_label")}
                  </div>
                  <div class="text-sm text-slate-400">
                    ${translateText("user_setting.exit_game_info")}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
