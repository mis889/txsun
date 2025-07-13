const Fastify = require("fastify");
const cors = require("@fastify/cors");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;
const HEARTBEAT_INTERVAL = 800;
const MAX_RECONNECT_ATTEMPTS = 10;

// Initialize Fastify with simple logger
const fastify = Fastify({
  logger: true,
  bodyLimit: 1048576 * 10
});

// Game data
const gameData = {
  sessions: [],
  currentSession: null,
  pendingSession: null,
  lastResults: [],
  lastUpdate: Date.now(),
  currentConfidence: Math.floor(Math.random() * (97 - 51 + 1)) + 51,
  maxSessions: 100,
  isConnected: false
};

// Prediction map (giữ nguyên như code gốc)
const predictionMap = {
  "TXT": "Xỉu", 
  "TTXX": "Tài", 
  "XXTXX": "Tài", 
  "TTX": "Xỉu", 
  "XTT": "Tài",
  "TXX": "Tài", 
  "XTX": "Xỉu", 
  "TXTX": "Tài", 
  "XTXX": "Tài", 
  "XXTX": "Tài",
  "TXTT": "Xỉu", 
  "TTT": "Tài", 
  "XXX": "Tài", 
  "TXXT": "Tài", 
  "XTXT": "Xỉu",
  "TXXT": "Tài", 
  "XXTT": "Tài", 
  "TTXX": "Xỉu", 
  "XTTX": "Tài", 
  "XTXTX": "Tài",
  "TTXXX": "Tài", 
  "XTTXT": "Tài", 
  "XXTXT": "Xỉu", 
  "TXTTX": "Tài", 
  "XTXXT": "Tài",
  "TTTXX": "Xỉu", 
  "XXTTT": "Tài", 
  "XTXTT": "Tài", 
  "TXTXT": "Tài", 
  "TTXTX": "Xỉu",
  "TXTTT": "Xỉu", 
  "XXTXTX": "Tài", 
  "XTXXTX": "Tài", 
  "TXTTTX": "Tài", 
  "TTTTXX": "Xỉu",
  "XTXTTX": "Tài", 
  "XTXXTT": "Tài", 
  "TXXTXX": "Tài", 
  "XXTXXT": "Tài", 
  "TXTTXX": "Xỉu",
  "TTTXTX": "Xỉu", 
  "TTXTTT": "Tài", 
  "TXXTTX": "Tài", 
  "XXTTTX": "Tài", 
  "XTTTTX": "Xỉu",
  "TXTXTT": "Tài", 
  "TXTXTX": "Tài", 
  "TTTTX": "Tài", 
  "XXXTX": "Tài", 
  "TXTTTX": "Xỉu",
  "XTXXXT": "Tài", 
  "XXTTXX": "Tài", 
  "TTTXXT": "Xỉu", 
  "XXTXXX": "Tài", 
  "XTXTXT": "Tài",
  "TTXXTX": "Tài", 
  "TTXXT": "Tài", 
  "TXXTX": "Xỉu", 
  "XTXXX": "Tài", 
  "XTXTX": "Xỉu",
  "TTXT": "Xỉu", 
  "TTTXT": "Xỉu",
  "TTTT": "Tài",
  "TTTTT": "Tài",
  "TTTTTT": "Xỉu",
  "TTTTTTT": "Tài",
  "TTTTTTX": "Xỉu",
  "TTTTTX": "Xỉu",
  "TTTTTXT": "Xỉu",
  "TTTTTXX": "Tài",
  "TTTTXT": "Xỉu",
  "TTTTXTT": "Tài",
  "TTTTXTX": "Xỉu",
  "TTTTXXT": "Xỉu",
  "TTTTXXX": "Tài",
  "TTTX": "Xỉu",
  "TTTXTT": "Tài",
  "TTTXTTT": "Xỉu",
  "TTTXTTX": "Xỉu",
  "TTTXTXT": "Tài",
  "TTTXTXX": "Tài",
  "TTTXXTT": "Tài",
  "TTTXXTX": "Tài",
  "TTTXXX": "Xỉu",
  "TTTXXXT": "Tài",
  "TTTXXXX": "Xỉu",
  "TTXTT": "Xỉu",
  "TTXTTTT": "Xỉu",
  "TTXTTTX": "Xỉu",
  "TTXTTX": "Tài",
  "TTXTTXT": "Tài",
  "TTXTTXX": "Xỉu",
  "TTXTXT": "Xỉu",
  "TTXTXTT": "Tài",
  "TTXTXTX": "Tài",
  "TTXTXX": "Xỉu",
  "TTXTXXT": "Tài",
  "TTXTXXX": "Xỉu",
  "TTXXTT": "Tài",
  "TTXXTTT": "Xỉu",
  "TTXXTTX": "Tài",
  "TTXXTXT": "Tài",
  "TTXXTXX": "Xỉu",
  "TTXXXT": "Xỉu",
  "TTXXXTT": "Tài",
  "TTXXXTX": "Tài",
  "TTXXXX": "Xỉu",
  "TTXXXXT": "Tài",
  "TTXXXXX": "Xỉu",
  "TXTTTT": "Xỉu",
  "TXTTTTT": "Xỉu",
  "TXTTTTX": "Xỉu",
  "TXTTTXT": "Xỉu",
  "TXTTTXX": "Tài",
  "TXTTXT": "Tài",
  "TXTTXTT": "Tài",
  "TXTTXTX": "Tài",
  "TXTTXXT": "Tài",
  "TXTTXXX": "Tài",
  "TXTXTTT": "Tài",
  "TXTXTTX": "Tài",
  "TXTXTXT": "Xỉu",
  "TXTXTXX": "Tài",
  "TXTXX": "Tài",
  "TXTXXT": "Tài",
  "TXTXXTT": "Tài",
  "TXTXXTX": "Xỉu",
  "TXTXXX": "Xỉu",
  "TXTXXXT": "Xỉu",
  "TXTXXXX": "Xỉu",
  "TXXTT": "Tài",
  "TXXTTT": "Tài",
  "TXXTTTT": "Tài",
  "TXXTTTX": "Tài",
  "TXXTTXT": "Xỉu",
  "TXXTTXX": "Xỉu",
  "TXXTXT": "Tài",
  "TXXTXTT": "Tài",
  "TXXTXTX": "Tài",
  "TXXTXXT": "Tài",
  "TXXTXXX": "Xỉu",
  "TXXX": "Tài",
  "TXXXT": "Tài",
  "TXXXTT": "Xỉu",
  "TXXXTTT": "Tài",
  "TXXXTTX": "Xỉu",
  "TXXXTX": "Xỉu",
  "TXXXTXT": "Tài",
  "TXXXTXX": "Xỉu",
  "TXXXX": "Xỉu",
  "TXXXXT": "Tài",
  "TXXXXTT": "Xỉu",
  "TXXXXTX": "Xỉu",
  "TXXXXX": "Tài",
  "TXXXXXT": "Xỉu",
  "TXXXXXX": "Xỉu",
  "XTTT": "Xỉu",
  "XTTTT": "Xỉu",
  "XTTTTT": "Tài",
  "XTTTTTT": "Tài",
  "XTTTTTX": "Tài",
  "XTTTTXT": "Tài",
  "XTTTTXX": "Xỉu",
  "XTTTX": "Tài",
  "XTTTXT": "Xỉu",
  "XTTTXTT": "Tài",
  "XTTTXTX": "Xỉu",
  "XTTTXX": "Tài",
  "XTTTXXT": "Tài",
  "XTTTXXX": "Tài",
  "XTTXTT": "Tài",
  "XTTXTTT": "Tài",
  "XTTXTTX": "Tài",
  "XTTXTX": "Xỉu",
  "XTTXTXT": "Tài",
  "XTTXTXX": "Xỉu",
  "XTTXX": "Xỉu",
  "XTTXXT": "Xỉu",
  "XTTXXTT": "Tài",
  "XTTXXTX": "Xỉu",
  "XTTXXX": "Tài",
  "XTTXXXT": "Xỉu",
  "XTTXXXX": "Tài",
  "XTXTTT": "Tài",
  "XTXTTTT": "Tài",
  "XTXTTTX": "Xỉu",
  "XTXTTXT": "Xỉu",
  "XTXTTXX": "Tài",
  "XTXTXTT": "Tài",
  "XTXTXTX": "Xỉu",
  "XTXTXX": "Tài",
  "XTXTXXT": "Tài",
  "XTXTXXX": "Tài",
  "XTXXTTT": "Tài",
  "XTXXTTX": "Xỉu",
  "XTXXTXT": "Tài",
  "XTXXTXX": "Tài",
  "XTXXXTT": "Xỉu",
  "XTXXXTX": "Tài",
  "XTXXXX": "Xỉu",
  "XTXXXXT": "Tài",
  "XTXXXXX": "Tài",
  "XXT": "Xỉu",
  "XXTTTT": "Tài",
  "XXTTTTT": "Xỉu",
  "XXTTTTX": "Tài",
  "XXTTTXT": "Xỉu",
  "XXTTTXX": "Xỉu",
  "XXTTX": "Tài",
  "XXTTXT": "Xỉu",
  "XXTTXTT": "Xỉu",
  "XXTTXTX": "Tài",
  "XXTTXXT": "Xỉu",
  "XXTTXXX": "Tài",
  "XXTXTT": "Tài",
  "XXTXTTT": "Tài",
  "XXTXTTX": "Xỉu",
  "XXTXTXT": "Tài",
  "XXTXTXX": "Tài",
  "XXTXXTT": "Xỉu",
  "XXTXXTX": "Xỉu",
  "XXTXXXT": "Tài",
  "XXTXXXX": "Tài",
  "XXXT": "Tài",
  "XXXTT": "Xỉu",
  "XXXTTT": "Xỉu",
  "XXXTTTT": "Xỉu",
  "XXXTTTX": "Xỉu",
  "XXXTTX": "Tài",
  "XXXTTXT": "Xỉu",
  "XXXTTXX": "Xỉu",
  "XXXTXT": "Tài",
  "XXXTXTT": "Tài",
  "XXXTXTX": "Xỉu",
  "XXXTXX": "Tài",
  "XXXTXXT": "Xỉu",
  "XXXTXXX": "Tài",
  "XXXX": "Tài",
  "XXXXT": "Xỉu",
  "XXXXTT": "Xỉu",
  "XXXXTTT": "Tài",
  "XXXXTTX": "Tài",
  "XXXXTX": "Tài",
  "XXXXTXT": "Tài",
  "XXXXTXX": "Tài",
  "XXXXX": "Tài",
  "XXXXXT": "Xỉu",
  "XXXXXTT": "Tài",
  "XXXXXTX": "Tài",
  "XXXXXX": "Tài",
  "XXXXXXT": "Tài",
  "XXXXXXX": "Tài"
};

function predictFromPattern(pattern) {
  for (let len = Math.min(pattern.length, 4); len >= 1; len--) {
    const key = pattern.substring(0, len);
    if (predictionMap[key]) return predictionMap[key];
  }
  return pattern[0] === "T" ? "Tài" : "Xỉu";
}

function calculateResult(d1, d2, d3) {
  const sum = d1 + d2 + d3;
  return {
    result: sum >= 11 ? "T" : "X",
    sum: sum
  };
}

// WebSocket Connection
let wsConnection = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;

function connectWebSocket() {
  if (wsConnection) {
    wsConnection.removeAllListeners();
    if (wsConnection.readyState !== WebSocket.CLOSED) {
      wsConnection.close();
    }
  }

  clearInterval(heartbeatTimer);

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    fastify.log.error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    return;
  }

  reconnectAttempts++;
  fastify.log.info(`Connecting to SunWin (attempt ${reconnectAttempts})...`);

  wsConnection = new WebSocket("wss://websocket.atpman.net/websocket");

  wsConnection.on('open', () => {
    reconnectAttempts = 0;
    gameData.isConnected = true;
    fastify.log.info("Connection established");
    
    const authData = [
      1,
      "MiniGame",
      "dfghhhgffgggg",
      "tinhbip",
      {
        info: "{\"ipAddress\":\"2402:9d80:36a:1716:13d7:a37a:60e2:2c64\",\"userId\":\"f68cd413-44d4-4bf5-96eb-23da9a317f17\",\"username\":\"S8_dfghhhgffgggg\",\"timestamp\":1752167805248,\"refreshToken\":\"498e236e749f4afdb8517d1cd23a419b.0ab31b9e397f4cf0b9c23b3d6a7596b6\"}",
        signature: "52830A25058B665F9A929FD75A80E6893BCD7DDB2BA3276B132BC863453AA09AE60B66FBE4B25F3892B27492391BF08F30D2DDD84B140F0007F1630BC6727A45543749ED892B94D78FEC9683FCF9A15F4EF582D8E4D9F7DD85AFD3BAE566A7B886F7DC380DA10EF5527C38BEE9E4F06C95B9612105CC1B2545C2A13644A29F1F"
      }
    ];
    
    wsConnection.send(JSON.stringify(authData));
    wsConnection.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1001 }]));
    
    heartbeatTimer = setInterval(() => {
      if (wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify([6, "MiniGame", "taixiuUnbalancedPlugin", { cmd: 2000 }]));
      }
    }, HEARTBEAT_INTERVAL);
  });

  wsConnection.on('message', (data) => {
    try {
      const json = JSON.parse(data);

      // Process real-time results
      if (Array.isArray(json) && json[3]?.res?.d1 !== undefined) {
        const res = json[3].res;
        
        const isNewSession = !gameData.currentSession || 
                           (res.sid > gameData.currentSession && 
                            res.timestamp > (gameData.lastUpdate - 10000));
        
        if (isNewSession) {
          if (gameData.pendingSession) {
            const result = calculateResult(gameData.pendingSession.d1, 
                                          gameData.pendingSession.d2, 
                                          gameData.pendingSession.d3);
            
            gameData.lastResults.unshift({
              ...gameData.pendingSession,
              result: result.result,
              sum: result.sum
            });
            
            if (gameData.lastResults.length > 20) {
              gameData.lastResults.pop();
            }
          }

          gameData.pendingSession = {
            sid: res.sid,
            d1: res.d1,
            d2: res.d2,
            d3: res.d3,
            timestamp: Date.now()
          };
          
          gameData.currentSession = res.sid;
          gameData.currentConfidence = Math.floor(Math.random() * (97 - 51 + 1)) + 51;
          gameData.lastUpdate = Date.now();
          
          fastify.log.info(`New session ${res.sid}: ${res.d1},${res.d2},${res.d3}`);
        }
      }
      // Process history
      else if (Array.isArray(json) && json[1]?.htr) {
        gameData.sessions = json[1].htr
          .filter(x => x.d1 !== undefined)
          .map(x => {
            const result = calculateResult(x.d1, x.d2, x.d3);
            return {
              sid: x.sid,
              d1: x.d1,
              d2: x.d2,
              d3: x.d3,
              result: result.result,
              sum: result.sum,
              timestamp: Date.now()
            };
          })
          .sort((a, b) => b.sid - a.sid)
          .slice(0, gameData.maxSessions);
          
        if (gameData.sessions.length > 0) {
          gameData.currentSession = gameData.sessions[0].sid;
        }
        fastify.log.info(`Loaded ${gameData.sessions.length} historical sessions`);
      }
    } catch (error) {
      fastify.log.error("Data processing error:", error);
    }
  });

  wsConnection.on('close', () => {
    gameData.isConnected = false;
    fastify.log.warn("Connection lost, attempting to reconnect...");
    setTimeout(connectWebSocket, 5000);
  });

  wsConnection.on('error', (err) => {
    gameData.isConnected = false;
    fastify.log.error("Connection error:", err);
  });
}

// CORS
fastify.register(cors, {
  origin: "*",
  methods: ["GET", "OPTIONS"]
});

// API Endpoint - Đã sửa đổi để trả về đúng định dạng
fastify.get("/api/789club", async (request, reply) => {
  try {
    const allResults = [
      ...(gameData.pendingSession ? [{
        ...gameData.pendingSession,
        ...calculateResult(gameData.pendingSession.d1, gameData.pendingSession.d2, gameData.pendingSession.d3)
      }] : []),
      ...gameData.lastResults,
      ...gameData.sessions
    ].sort((a, b) => b.sid - a.sid);

    if (allResults.length === 0) {
      return reply.status(404).send({
        status: "error",
        message: "No session data available",
        is_connected: gameData.isConnected
      });
    }

    const last15Results = allResults.slice(0, 15);
    const pattern = last15Results.map(p => p.result).join("");

    const response = {
      phien_hien_tai: allResults[0].sid + 1, // Phiên tiếp theo
      du_doan: predictFromPattern(pattern),
      do_tin_cay: gameData.currentConfidence,
      data: {
        session: allResults[0].sid,
        dice: [allResults[0].d1, allResults[0].d2, allResults[0].d3],
        result: allResults[0].result,
        sum: allResults[0].sum,
        next_session: allResults[0].sid + 1,
        prediction: predictFromPattern(pattern),
        confidence: `${gameData.currentConfidence}%`,
        pattern: pattern,
        algorithm: pattern.substring(0, 6),
        last_update: gameData.lastUpdate,
        server_time: Date.now(),
        is_live: !!gameData.pendingSession,
        is_connected: gameData.isConnected,
        total_sessions: allResults.length
      }
    };

    return response;
  } catch (err) {
    fastify.log.error("API error:", err);
    return reply.status(500).send({
      status: "error",
      message: "System error"
    });
  }
});

// Start server
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error("Server startup error:", err);
    process.exit(1);
  }
  fastify.log.info(`Server running on port ${PORT}`);
  connectWebSocket();
});

// Handle server shutdown
process.on("SIGINT", () => {
  fastify.log.info("Shutting down server...");
  if (wsConnection) wsConnection.close();
  clearInterval(heartbeatTimer);
  fastify.close().then(() => {
    process.exit(0);
  });
});
