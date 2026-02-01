import cluster from "cluster";
import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { GameEnv } from "../core/configuration/Config";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { GameInfo } from "../core/Schemas";
import { generateID } from "../core/Util";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";
import { startPolling } from "./PollingLoop";
import { renderHtml } from "./RenderHtml";

const config = getServerConfigFromServer();
const playlist = new MapPlaylist();
const readyWorkers = new Set();

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "m" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Middleware to handle HTML files with EJS templating
app.use(async (req, res, next) => {
  if (req.path === "/") {
    try {
      await renderHtml(res, path.join(__dirname, "../../static/index.html"));
    } catch (error) {
      log.error("Error rendering index.html:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    next();
  }
});

app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res, filePath) => {
      // You can conditionally set different cache times based on file types
      if (filePath.match(/\.(js|css|svg)$/)) {
        // JS, CSS, SVG get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.match(/\.(bin|dat)$/)) {
        // Binary map files - prevent CDN/proxy transformation and ensure correct type
        res.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable, no-transform",
        );
        res.setHeader("Content-Type", "application/octet-stream");
      } else if (filePath.match(/\.(exe|dll|so|dylib)$/)) {
        // Other binary files also get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      // Other file types use the default maxAge setting
    },
  }),
);

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
  }),
);

let publicLobbiesData: { lobbies: GameInfo[] } = { lobbies: [] };

const publicLobbyIDs: Set<string> = new Set();
const connectedClients: Set<WebSocket> = new Set();

// Broadcast lobbies to all connected clients
function broadcastLobbies() {
  const message = JSON.stringify({
    type: "lobbies_update",
    data: publicLobbiesData,
  });

  const clientsToRemove: WebSocket[] = [];

  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      clientsToRemove.push(client);
    }
  });

  clientsToRemove.forEach((client) => {
    connectedClients.delete(client);
  });
}

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  log.info(`Setting up ${config.numWorkers()} workers...`);

  // Setup WebSocket server for clients
  // Use noServer: true so we can manually handle upgrades for both /lobbies and worker paths
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    connectedClients.add(ws);

    // Send current lobbies immediately (always send, even if empty)
    ws.send(
      JSON.stringify({ type: "lobbies_update", data: publicLobbiesData }),
    );

    ws.on("close", () => {
      connectedClients.delete(ws);
    });

    ws.on("error", (error) => {
      log.error(`WebSocket error:`, error);
      connectedClients.delete(ws);
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close(1011, "WebSocket internal error");
        }
      } catch (closeError) {
        log.error("Error while closing WebSocket after error:", closeError);
      }
    });
  });

  // Generate admin token for worker authentication
  const ADMIN_TOKEN = crypto.randomBytes(16).toString("hex");
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  const INSTANCE_ID =
    config.env() === GameEnv.Dev
      ? "DEV_ID"
      : crypto.randomBytes(4).toString("hex");
  process.env.INSTANCE_ID = INSTANCE_ID;

  log.info(`Instance ID: ${INSTANCE_ID}`);

  // Fork workers
  for (let i = 0; i < config.numWorkers(); i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
      ADMIN_TOKEN,
      INSTANCE_ID,
    });

    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);
  }

  cluster.on("message", (worker, message) => {
    if (message.type === "WORKER_READY") {
      const workerId = message.workerId;
      readyWorkers.add(workerId);
      log.info(
        `Worker ${workerId} is ready. (${readyWorkers.size}/${config.numWorkers()} ready)`,
      );
      // Start scheduling when all workers are ready
      if (readyWorkers.size === config.numWorkers()) {
        log.info("All workers ready, starting game scheduling");

        const scheduleLobbies = () => {
          schedulePublicGame(playlist).catch((error) => {
            log.error("Error scheduling public game:", error);
          });
        };

        startPolling(async () => {
          const lobbies = await fetchLobbies();
          if (lobbies === 0) {
            scheduleLobbies();
          }
        }, 100);
      }
    }
  });

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    const workerId = (worker as any).process?.env?.WORKER_ID;
    if (!workerId) {
      log.error(`worker crashed could not find id`);
      return;
    }

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );
    log.info(`Restarting worker ${workerId}...`);

    // Restart the worker with the same ID
    const newWorker = cluster.fork({
      WORKER_ID: workerId,
      ADMIN_TOKEN,
      INSTANCE_ID,
    });

    log.info(
      `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
    );
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });

  // WebSocket proxy for worker paths /w{N}
  // This handles game WebSocket connections when nginx is not present
  // Also handles for /lobbies path
  const workerWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";

    // Handle /lobbies path with the main wss
    if (url === "/lobbies") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
      return;
    }

    // Handle /w{N} paths - proxy to worker using WebSocket relay
    const workerMatch = url.match(/^\/w(\d+)$/);
    if (workerMatch) {
      const workerIndex = parseInt(workerMatch[1], 10);

      if (workerIndex < 0 || workerIndex >= config.numWorkers()) {
        log.warn(`WebSocket: Invalid worker index ${workerIndex}`);
        socket.destroy();
        return;
      }

      const workerPort = config.workerPortByIndex(workerIndex);

      // First, accept the client's WebSocket connection
      workerWss.handleUpgrade(request, socket, head, (clientWs) => {
        // Now create a WebSocket connection to the worker
        const workerWsUrl = `ws://127.0.0.1:${workerPort}/`;
        const workerWs = new WebSocket(workerWsUrl, {
          headers: {
            "X-Forwarded-For":
              (request.headers["x-forwarded-for"] as string) ||
              request.socket.remoteAddress ||
              "",
            "X-Real-IP":
              (request.headers["x-real-ip"] as string) ||
              request.socket.remoteAddress ||
              "",
          },
        });

        let workerConnected = false;
        const pendingMessages: Buffer[] = [];

        workerWs.on("open", () => {
          workerConnected = true;
          // Send any pending messages
          for (const msg of pendingMessages) {
            workerWs.send(msg);
          }
          pendingMessages.length = 0;
        });

        workerWs.on("message", (data: Buffer) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
          }
        });

        workerWs.on("close", (code, reason) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(code, reason.toString());
          }
        });

        workerWs.on("error", (err) => {
          log.error(`Worker WebSocket error (worker ${workerIndex}):`, err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, "Worker connection error");
          }
        });

        clientWs.on("message", (data: Buffer) => {
          if (workerConnected && workerWs.readyState === WebSocket.OPEN) {
            workerWs.send(data);
          } else {
            // Queue message until worker is connected
            pendingMessages.push(data);
          }
        });

        clientWs.on("close", (code, reason) => {
          if (workerWs.readyState === WebSocket.OPEN) {
            workerWs.close(code, reason.toString());
          }
        });

        clientWs.on("error", (err) => {
          log.error(`Client WebSocket error:`, err);
          if (workerWs.readyState === WebSocket.OPEN) {
            workerWs.close(1011, "Client connection error");
          }
        });
      });

      return;
    }

    // Unknown path - destroy socket
    socket.destroy();
  });
}

app.get("/api/env", async (req, res) => {
  const envConfig = {
    game_env: process.env.GAME_ENV,
    num_workers: config.numWorkers(),
  };
  if (!envConfig.game_env) return res.sendStatus(500);
  res.json(envConfig);
});

// Add lobbies endpoint to list public games for this worker
app.get("/api/public_lobbies", async (req, res) => {
  res.json(publicLobbiesData);
});

// Worker proxy - routes /w{N}/* requests to the appropriate worker
// This is needed when nginx is not present (e.g., Railway deployments)
app.use(/^\/w(\d+)\/(.*)$/, async (req, res) => {
  const match = req.path.match(/^\/w(\d+)\/(.*)$/);
  if (!match) {
    return res.status(400).send("Invalid worker path");
  }

  const workerIndex = parseInt(match[1], 10);
  const remainingPath = "/" + match[2];

  // Validate worker index
  if (workerIndex < 0 || workerIndex >= config.numWorkers()) {
    log.warn(
      `Invalid worker index ${workerIndex}, numWorkers=${config.numWorkers()}`,
    );
    return res.status(404).send("Worker not found");
  }

  const workerPort = config.workerPortByIndex(workerIndex);
  const targetUrl = `http://localhost:${workerPort}${remainingPath}`;

  try {
    // Build query string
    const queryString = new URLSearchParams(
      req.query as Record<string, string>,
    ).toString();
    const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        "Content-Type": req.get("Content-Type") || "application/json",
        [config.adminHeader()]: config.adminToken(),
      },
    };

    // Add body for non-GET requests
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(fullUrl, fetchOptions);

    // Copy response status and headers
    res.status(response.status);

    // Forward response body
    const contentType = response.headers.get("Content-Type");
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    if (contentType?.includes("application/json")) {
      const json = await response.json();
      res.json(json);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    log.error(`Error proxying to worker ${workerIndex}:`, error);
    res.status(502).send("Worker proxy error");
  }
});

async function fetchLobbies(): Promise<number> {
  const fetchPromises: Promise<GameInfo | null>[] = [];

  for (const gameID of new Set(publicLobbyIDs)) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000); // 5 second timeout
    const port = config.workerPort(gameID);
    const promise = fetch(`http://localhost:${port}/api/game/${gameID}`, {
      headers: { [config.adminHeader()]: config.adminToken() },
      signal: controller.signal,
    })
      .then((resp) => resp.json())
      .then((json) => {
        return json as GameInfo;
      })
      .catch((error) => {
        log.error(`Error fetching game ${gameID}:`, error);
        // Return null or a placeholder if fetch fails
        publicLobbyIDs.delete(gameID);
        return null;
      });

    fetchPromises.push(promise);
  }

  // Wait for all promises to resolve
  const results = await Promise.all(fetchPromises);

  // Filter out any null results from failed fetches
  const lobbyInfos: GameInfo[] = results
    .filter((result) => result !== null)
    .map((gi: GameInfo) => {
      return {
        gameID: gi.gameID,
        numClients: gi?.clients?.length ?? 0,
        gameConfig: gi.gameConfig,
        msUntilStart: (gi.msUntilStart ?? Date.now()) - Date.now(),
      } as GameInfo;
    });

  lobbyInfos.forEach((l) => {
    if (
      "msUntilStart" in l &&
      l.msUntilStart !== undefined &&
      l.msUntilStart <= 250
    ) {
      publicLobbyIDs.delete(l.gameID);
      return;
    }

    if (
      "gameConfig" in l &&
      l.gameConfig !== undefined &&
      "maxPlayers" in l.gameConfig &&
      l.gameConfig.maxPlayers !== undefined &&
      "numClients" in l &&
      l.numClients !== undefined &&
      l.gameConfig.maxPlayers <= l.numClients
    ) {
      publicLobbyIDs.delete(l.gameID);
      return;
    }
  });

  // Update the lobbies data
  publicLobbiesData = {
    lobbies: lobbyInfos,
  };

  broadcastLobbies();

  return publicLobbyIDs.size;
}

// Function to schedule a new public game
async function schedulePublicGame(playlist: MapPlaylist) {
  const gameID = generateID();
  publicLobbyIDs.add(gameID);

  const workerPath = config.workerPath(gameID);

  // Send request to the worker to start the game
  try {
    const response = await fetch(
      `http://localhost:${config.workerPort(gameID)}/api/create_game/${gameID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [config.adminHeader()]: config.adminToken(),
        },
        body: JSON.stringify(await playlist.gameConfig()),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to schedule public game: ${response.statusText}`);
    }
  } catch (error) {
    log.error(`Failed to schedule public game on worker ${workerPath}:`, error);
    throw error;
  }
}

// SPA fallback route
app.get("*", async function (_req, res) {
  try {
    const htmlPath = path.join(__dirname, "../../static/index.html");
    await renderHtml(res, htmlPath);
  } catch (error) {
    log.error("Error rendering SPA fallback:", error);
    res.status(500).send("Internal Server Error");
  }
});
