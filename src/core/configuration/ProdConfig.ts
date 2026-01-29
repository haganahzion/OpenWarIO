import { GameEnv } from "./Config";
import { DefaultServerConfig } from "./DefaultConfig";

export const prodConfig = new (class extends DefaultServerConfig {
  numWorkers(): number {
    // Allow override via environment variable for different hosting environments
    const envWorkers = process.env.NUM_WORKERS;
    if (envWorkers) {
      const parsed = parseInt(envWorkers, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 20;
  }
  env(): GameEnv {
    return GameEnv.Prod;
  }
  jwtAudience(): string {
    return "openfront.io";
  }
  turnstileSiteKey(): string {
    return "0x4AAAAAACFLkaecN39lS8sk";
  }
})();
