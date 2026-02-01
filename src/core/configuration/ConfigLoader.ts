import { UserSettings } from "../game/UserSettings";
import { GameConfig } from "../Schemas";
import { Config, GameEnv, ServerConfig } from "./Config";
import { DefaultConfig, DefaultServerConfig } from "./DefaultConfig";
import { DevConfig, DevServerConfig } from "./DevConfig";
import { Env } from "./Env";
import { preprodConfig } from "./PreprodConfig";
import { prodConfig } from "./ProdConfig";

// Dynamic server config that uses num_workers from the API response
class DynamicServerConfig extends DefaultServerConfig {
  constructor(
    private _numWorkers: number,
    private _env: GameEnv,
  ) {
    super();
  }
  numWorkers(): number {
    return this._numWorkers;
  }
  env(): GameEnv {
    return this._env;
  }
  jwtAudience(): string {
    return "openfront.io";
  }
  turnstileSiteKey(): string {
    return "0x4AAAAAACFLkaecN39lS8sk";
  }
}

export let cachedSC: ServerConfig | null = null;

export async function getConfig(
  gameConfig: GameConfig,
  userSettings: UserSettings | null,
  isReplay: boolean = false,
): Promise<Config> {
  const sc = await getServerConfigFromClient();
  switch (sc.env()) {
    case GameEnv.Dev:
      return new DevConfig(sc, gameConfig, userSettings, isReplay);
    case GameEnv.Preprod:
    case GameEnv.Prod:
      console.log("using prod config");
      return new DefaultConfig(sc, gameConfig, userSettings, isReplay);
    default:
      throw Error(`unsupported server configuration: ${Env.GAME_ENV}`);
  }
}
export async function getServerConfigFromClient(): Promise<ServerConfig> {
  if (cachedSC) {
    return cachedSC;
  }
  const response = await fetch("/api/env");

  if (!response.ok) {
    throw new Error(
      `Failed to fetch server config: ${response.status} ${response.statusText}`,
    );
  }
  const config = await response.json();
  // Log the retrieved configuration
  console.log("Server config loaded:", config);

  // Use num_workers from server if provided (for Railway/single-worker deployments)
  if (config.num_workers !== undefined) {
    const gameEnv = config.game_env === "prod" ? GameEnv.Prod :
                    config.game_env === "staging" ? GameEnv.Preprod :
                    GameEnv.Dev;
    cachedSC = new DynamicServerConfig(config.num_workers, gameEnv);
  } else {
    cachedSC = getServerConfig(config.game_env);
  }
  return cachedSC;
}
export function getServerConfigFromServer(): ServerConfig {
  const gameEnv = Env.GAME_ENV;
  return getServerConfig(gameEnv);
}
export function getServerConfig(gameEnv: string) {
  switch (gameEnv) {
    case "dev":
      console.log("using dev server config");
      return new DevServerConfig();
    case "staging":
      console.log("using preprod server config");
      return preprodConfig;
    case "prod":
      console.log("using prod server config");
      return prodConfig;
    default:
      throw Error(`unsupported server configuration: ${gameEnv}`);
  }
}
