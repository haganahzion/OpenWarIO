import cluster from "cluster";
import * as dotenv from "dotenv";
import { Env } from "../core/configuration/Env";
import { startMaster } from "./Master";
import { startSingleServer } from "./SingleServer";
import { startWorker } from "./Worker";

// Load environment variables before we read configuration values derived from them.
dotenv.config();

// Main entry point of the application
async function main() {
  // Use single server mode for simple deployments (Railway, etc.)
  if (Env.SINGLE_SERVER_MODE) {
    console.log("Starting in Single Server Mode...");
    await startSingleServer();
    return;
  }

  // Check if this is the primary (master) process
  if (cluster.isPrimary) {
    console.log("Starting master process...");
    await startMaster();
  } else {
    // This is a worker process
    console.log("Starting worker process...");
    await startWorker();
  }
}

// Start the application
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
