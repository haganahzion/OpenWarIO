/**
 * Single Server Mode - Simple server for Railway and private games
 * No workers, no complex auth - just simple game hosting
 */
import crypto from "crypto";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { GameConfig, GameInfo, ClientMessageSchema } from "../core/Schemas";
import { generateID } from "../core/Util";
import { GameType } from "../core/game/Game";
import { Client } from "./Client";
import { GameManager } from "./GameManager";
import { logger } from "./Logger";
import { renderHtml } from "./RenderHtml";

const config = getServerConfigFromServer();

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "single" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Serve index.html for root
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

// Static files
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

// Store for public lobbies
let publicLobbies: GameInfo[] = [];
const lobbyClients: Set<WebSocket> = new Set();

function broadcastLobbies() {
  const message = JSON.stringify({
    type: "lobbies_update",
    data: { lobbies: publicLobbies },
  });
  lobbyClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function startSingleServer() {
  log.info("Starting Single Server Mode");

  // Set admin token
  const ADMIN_TOKEN = crypto.randomBytes(16).toString("hex");
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.INSTANCE_ID = crypto.randomBytes(4).toString("hex");

  // Create game manager
  const gm = new GameManager(config, log);

  // WebSocket servers
  const lobbyWss = new WebSocketServer({ noServer: true });
  const gameWss = new WebSocketServer({ noServer: true });

  // Lobby list WebSocket
  lobbyWss.on("connection", (ws) => {
    lobbyClients.add(ws);
    ws.send(JSON.stringify({ type: "lobbies_update", data: { lobbies: publicLobbies } }));
    ws.on("close", () => lobbyClients.delete(ws));
    ws.on("error", () => lobbyClients.delete(ws));
  });

  // Game WebSocket - simplified, no auth required
  gameWss.on("connection", (ws, req) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
               req.socket.remoteAddress ||
               "unknown";

    // Track whether this connection has joined a game
    // After join, GameServer handles all messages
    let hasJoined = false;

    ws.on("message", (data: WebSocket.RawData) => {
      // After join, GameServer's handler (added via addListeners) handles messages
      // This handler should be removed by removeAllListeners in GameServer.addListeners
      // But as a safety net, also skip if already joined
      if (hasJoined) {
        return;
      }

      try {
        const message = JSON.parse(data.toString());

        if (message.type === "ping") {
          return;
        }

        // Only handle join and rejoin - other messages are handled by GameServer
        if (message.type !== "join" && message.type !== "rejoin") {
          return;
        }

        const gameID = message.gameID;
        const clientID = message.clientID || generateID();
        const username = message.username || `Player${Math.floor(Math.random() * 1000)}`;

        if (message.type === "rejoin") {
          const wasFound = gm.rejoinClient(ws, clientID, message);
          if (!wasFound) {
            ws.close(1002, "Game not found");
          } else {
            hasJoined = true;
          }
          return;
        }

        // Simple client creation - no auth needed
        const client = new Client(
          clientID,
          clientID, // Use clientID as persistentId
          null,     // No claims
          undefined, // No roles
          undefined, // No flares
          ip,
          username,
          ws,
          message.cosmetics || {},
        );

        const wasFound = gm.joinClient(client, gameID);
        if (!wasFound) {
          log.warn(`Game ${gameID} not found`);
          ws.close(1002, "Game not found");
        } else {
          log.info(`Player ${username} (${clientID}) joined game ${gameID}`);
          hasJoined = true;
        }
      } catch (error) {
        log.error("Error handling game message:", error);
      }
    });

    ws.on("error", (err) => {
      log.error("WebSocket error:", err);
    });
  });

  // Handle WebSocket upgrades
  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";

    if (url === "/lobbies") {
      lobbyWss.handleUpgrade(request, socket, head, (ws) => {
        lobbyWss.emit("connection", ws, request);
      });
    } else if (url === "/w0" || url.startsWith("/w")) {
      gameWss.handleUpgrade(request, socket, head, (ws) => {
        gameWss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // API: Environment info
  app.get("/api/env", (req, res) => {
    res.json({
      game_env: process.env.GAME_ENV || "production",
      num_workers: 1,
    });
  });

  // API: Public lobbies
  app.get("/api/public_lobbies", (req, res) => {
    res.json({ lobbies: publicLobbies });
  });

  // API: Create game (handles both paths)
  const createGame = (req: express.Request, res: express.Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: "Game ID required" });
      }

      const creatorClientID = typeof req.query.creatorClientID === "string"
        ? req.query.creatorClientID
        : undefined;

      // Default to private game
      const gameConfig: Partial<GameConfig> = req.body || {};
      if (!gameConfig.gameType) {
        gameConfig.gameType = GameType.Private;
      }

      const game = gm.createGame(id, gameConfig as GameConfig, creatorClientID);
      log.info(`Created ${game.isPublic() ? "public" : "private"} game: ${id}`);

      res.json(game.gameInfo());
    } catch (error) {
      log.error("Error creating game:", error);
      res.status(500).json({ error: "Failed to create game" });
    }
  };

  app.post("/api/create_game/:id", createGame);
  app.post("/w0/api/create_game/:id", createGame);
  app.post("/w:workerId/api/create_game/:id", createGame);

  // API: Get game info
  const getGame = (req: express.Request, res: express.Response) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    res.json(game.gameInfo());
  };

  app.get("/api/game/:id", getGame);
  app.get("/w0/api/game/:id", getGame);
  app.get("/w:workerId/api/game/:id", getGame);

  // API: Check if game exists
  app.get("/api/game/:id/exists", (req, res) => {
    res.json({ exists: gm.game(req.params.id) !== null });
  });
  app.get("/w0/api/game/:id/exists", (req, res) => {
    res.json({ exists: gm.game(req.params.id) !== null });
  });

  // API: Start game
  const startGame = (req: express.Request, res: express.Response) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    game.start();
    log.info(`Started game: ${req.params.id}`);
    res.json({ success: true });
  };

  app.post("/api/start_game/:id", startGame);
  app.post("/w0/api/start_game/:id", startGame);
  app.post("/w:workerId/api/start_game/:id", startGame);

  // API: Update game config
  const updateGame = (req: express.Request, res: express.Response) => {
    const game = gm.game(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    game.updateGameConfig(req.body);
    res.json(game.gameInfo());
  };

  app.put("/api/game/:id", updateGame);
  app.put("/w0/api/game/:id", updateGame);
  app.put("/w:workerId/api/game/:id", updateGame);

  // SPA fallback
  app.get("*", async (req, res) => {
    try {
      await renderHtml(res, path.join(__dirname, "../../static/index.html"));
    } catch (error) {
      log.error("Error rendering SPA fallback:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    log.info(`Single Server listening on port ${PORT}`);
  });

  log.info("Single Server started successfully");
}
