/**
 * Single Server Mode - All-in-one server for Railway and simple deployments
 * No worker processes, no proxying - everything runs in one process
 */
import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import ipAnonymize from "ip-anonymize";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { GameEnv } from "../core/configuration/Config";
import { Env } from "../core/configuration/Env";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import {
  ClientMessageSchema,
  GameConfig,
  GameID,
  GameInfo,
  ID,
} from "../core/Schemas";
import { generateID } from "../core/Util";
import { CreateGameInputSchema } from "../core/WorkerSchemas";
import { GameType } from "../core/game/Game";
import { Client } from "./Client";
import { GameManager } from "./GameManager";
import { getUserMe, verifyClientToken } from "./jwt";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";
import { startPolling } from "./PollingLoop";
import { PrivilegeRefresher } from "./PrivilegeRefresher";
import { renderHtml } from "./RenderHtml";
import { verifyTurnstileToken } from "./Turnstile";

const config = getServerConfigFromServer();
const playlist = new MapPlaylist();

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "single" });

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
    maxAge: "1y",
    setHeaders: (res, filePath) => {
      if (filePath.match(/\.(js|css|svg)$/)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.match(/\.(bin|dat)$/)) {
        res.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable, no-transform",
        );
        res.setHeader("Content-Type", "application/octet-stream");
      }
    },
  }),
);

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000,
    max: 20,
  }),
);

let publicLobbiesData: { lobbies: GameInfo[] } = { lobbies: [] };
const publicLobbyIDs: Set<string> = new Set();
const lobbyClients: Set<WebSocket> = new Set();

function broadcastLobbies() {
  const message = JSON.stringify({
    type: "lobbies_update",
    data: publicLobbiesData,
  });

  const toRemove: WebSocket[] = [];
  lobbyClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      toRemove.push(client);
    }
  });
  toRemove.forEach((c) => lobbyClients.delete(c));
}

export async function startSingleServer() {
  log.info("Starting Single Server Mode (no workers)");

  // Generate tokens
  const ADMIN_TOKEN = crypto.randomBytes(16).toString("hex");
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  const INSTANCE_ID =
    config.env() === GameEnv.Dev
      ? "DEV_ID"
      : crypto.randomBytes(4).toString("hex");
  process.env.INSTANCE_ID = INSTANCE_ID;

  log.info(`Instance ID: ${INSTANCE_ID}`);

  // Create game manager
  const gm = new GameManager(config, log);

  // Privilege refresher for cosmetics
  const privilegeRefresher = new PrivilegeRefresher(
    config.jwtIssuer() + "/cosmetics.json",
    log,
  );

  // WebSocket server for lobby listing
  const lobbyWss = new WebSocketServer({ noServer: true });

  lobbyWss.on("connection", (ws: WebSocket) => {
    lobbyClients.add(ws);
    ws.send(
      JSON.stringify({ type: "lobbies_update", data: publicLobbiesData }),
    );
    ws.on("close", () => lobbyClients.delete(ws));
    ws.on("error", () => lobbyClients.delete(ws));
  });

  // WebSocket server for games
  const gameWss = new WebSocketServer({ noServer: true });

  gameWss.on("connection", async (ws: WebSocket, req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded || req.socket.remoteAddress || "unknown";

    ws.on("message", async (message: string) => {
      try {
        const parsed = ClientMessageSchema.safeParse(
          JSON.parse(message.toString()),
        );
        if (!parsed.success) {
          const error = z.prettifyError(parsed.error);
          log.warn("Error parsing client message", error);
          ws.send(JSON.stringify({ type: "error", error: error.toString() }));
          return;
        }

        const clientMsg = parsed.data;

        if (clientMsg.type !== "join" && clientMsg.type !== "rejoin") {
          return;
        }

        // Verify token
        const result = await verifyClientToken(clientMsg.token, config);

        if (result.type === "error") {
          log.warn(`Invalid token: ${result.message}`);
          ws.close(1002, `Unauthorized: invalid token`);
          return;
        }

        const { persistentId, claims } = result;

        if (clientMsg.type === "rejoin") {
          const wasFound = gm.rejoinClient(ws, persistentId, clientMsg);
          if (!wasFound) {
            ws.close(1002, "Game not found");
          }
          return;
        }

        // Handle join
        let roles: string[] | undefined;
        let flares: string[] | undefined;

        const allowedFlares = config.allowedFlares();
        if (claims === null) {
          if (allowedFlares !== undefined) {
            ws.close(1002, "Unauthorized");
            return;
          }
        } else {
          const meResult = await getUserMe(clientMsg.token, config);
          if (meResult.type === "error") {
            ws.close(1002, "Unauthorized");
            return;
          }
          roles = meResult.response.player.roles;
          flares = meResult.response.player.flares;

          if (allowedFlares !== undefined) {
            const allowed =
              allowedFlares.length === 0 ||
              allowedFlares.some((f) => flares?.includes(f));
            if (!allowed) {
              ws.close(1002, "Forbidden");
              return;
            }
          }
        }

        const cosmeticResult = privilegeRefresher
          .get()
          .isAllowed(flares ?? [], clientMsg.cosmetics ?? {});

        if (cosmeticResult.type === "forbidden") {
          ws.close(1002, cosmeticResult.reason);
          return;
        }

        // Skip Turnstile if disabled or in dev mode
        if (config.env() !== GameEnv.Dev && !Env.DISABLE_TURNSTILE) {
          const turnstileResult = await verifyTurnstileToken(
            ip,
            clientMsg.turnstileToken,
            config.turnstileSecretKey(),
          );
          if (turnstileResult.status === "rejected") {
            ws.close(1002, "Unauthorized: Turnstile rejected");
            return;
          }
        }

        const client = new Client(
          clientMsg.clientID,
          persistentId,
          claims,
          roles,
          flares,
          ip,
          clientMsg.username,
          ws,
          cosmeticResult.cosmetics,
        );

        gm.joinClient(client, clientMsg.gameID);
      } catch (error) {
        log.error("Error handling message:", error);
      }
    });
  });

  // Handle WebSocket upgrades
  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";

    if (url === "/lobbies") {
      lobbyWss.handleUpgrade(request, socket, head, (ws) => {
        lobbyWss.emit("connection", ws, request);
      });
      return;
    }

    // Handle /w0 or just / for game connections in single server mode
    if (url === "/w0" || url === "/game" || url === "/") {
      gameWss.handleUpgrade(request, socket, head, (ws) => {
        gameWss.emit("connection", ws, request);
      });
      return;
    }

    socket.destroy();
  });

  // API Routes
  app.get("/api/env", (req, res) => {
    res.json({
      game_env: process.env.GAME_ENV,
      num_workers: 1,
    });
  });

  app.get("/api/public_lobbies", (req, res) => {
    res.json(publicLobbiesData);
  });

  // Create game endpoint - handles both /api/create_game and /w0/api/create_game
  const createGameHandler = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const id = req.params.id;
    const creatorClientID = (() => {
      if (typeof req.query.creatorClientID !== "string") return undefined;
      const trimmed = req.query.creatorClientID.trim();
      return ID.safeParse(trimmed).success ? trimmed : undefined;
    })();

    if (!id) {
      return res.status(400).json({ error: "Game ID is required" });
    }

    const result = CreateGameInputSchema.safeParse(req.body);
    if (!result.success) {
      const error = z.prettifyError(result.error);
      return res.status(400).json({ error });
    }

    const gc = result.data;

    // Only require admin token for public games
    if (
      gc?.gameType === GameType.Public &&
      req.headers[config.adminHeader()] !== config.adminToken()
    ) {
      return res.status(401).send("Unauthorized");
    }

    const game = gm.createGame(id, gc, creatorClientID);
    log.info(
      `Creating ${game.isPublic() ? "Public" : "Private"} game: ${id}${creatorClientID ? ` (creator: ${creatorClientID})` : ""}`,
    );

    res.json(game.gameInfo());
  };

  app.post("/api/create_game/:id", createGameHandler);
  app.post("/w0/api/create_game/:id", createGameHandler);

  // Game info endpoint
  const gameInfoHandler = (req: express.Request, res: express.Response) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    res.json(game.gameInfo());
  };

  app.get("/api/game/:id", gameInfoHandler);
  app.get("/w0/api/game/:id", gameInfoHandler);

  // Start game endpoint
  const startGameHandler = (req: express.Request, res: express.Response) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    game.start();
    res.json({ success: true });
  };

  app.post("/api/start_game/:id", startGameHandler);
  app.post("/w0/api/start_game/:id", startGameHandler);

  // Update game config
  app.put("/api/game/:id", (req, res) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    game.updateGameConfig(req.body as Partial<GameConfig>);
    res.json(game.gameInfo());
  });
  app.put("/w0/api/game/:id", (req, res) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    game.updateGameConfig(req.body as Partial<GameConfig>);
    res.json(game.gameInfo());
  });

  // SPA fallback
  app.get("*", async (req, res) => {
    try {
      await renderHtml(
        res,
        path.join(__dirname, "../../static/index.html"),
      );
    } catch (error) {
      log.error("Error rendering SPA fallback:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Start server
  const PORT = 3000;
  server.listen(PORT, () => {
    log.info(`Single Server listening on port ${PORT}`);
  });

  // Fetch and broadcast lobbies
  async function fetchLobbies(): Promise<number> {
    const fetchPromises: Promise<GameInfo | null>[] = [];

    for (const gameID of new Set(publicLobbyIDs)) {
      const game = gm.game(gameID);
      if (game) {
        fetchPromises.push(Promise.resolve(game.gameInfo()));
      } else {
        publicLobbyIDs.delete(gameID);
        fetchPromises.push(Promise.resolve(null));
      }
    }

    const results = await Promise.all(fetchPromises);
    const lobbyInfos: GameInfo[] = results
      .filter((r) => r !== null)
      .map((gi) => ({
        gameID: gi.gameID,
        numClients: gi?.clients?.length ?? 0,
        gameConfig: gi.gameConfig,
        msUntilStart: (gi.msUntilStart ?? Date.now()) - Date.now(),
      }));

    lobbyInfos.forEach((l) => {
      if (l.msUntilStart !== undefined && l.msUntilStart <= 250) {
        publicLobbyIDs.delete(l.gameID);
      }
      if (
        l.gameConfig?.maxPlayers !== undefined &&
        l.numClients !== undefined &&
        l.gameConfig.maxPlayers <= l.numClients
      ) {
        publicLobbyIDs.delete(l.gameID);
      }
    });

    publicLobbiesData = { lobbies: lobbyInfos };
    broadcastLobbies();
    return publicLobbyIDs.size;
  }

  // Schedule public games
  async function schedulePublicGame() {
    const gameID = generateID();
    publicLobbyIDs.add(gameID);

    const gameConfig = await playlist.gameConfig();
    const game = gm.createGame(gameID, gameConfig);
    log.info(`Scheduled public game: ${gameID}`);
  }

  // Start polling for lobbies
  startPolling(async () => {
    const count = await fetchLobbies();
    if (count === 0) {
      await schedulePublicGame();
    }
  }, 100);

  log.info("Single Server Mode started successfully");
}
