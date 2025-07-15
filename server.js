const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3060;

let lastResults = [];
let currentResult = null;
let currentSession = null;

let ws = null;
let reconnectInterval = 5000;

// === THUẬT TOÁN PHÂN TÍCH ===
const PATTERN_DATA = {
  "ttxttx": { tai: 80, xiu: 20 }, "xxttxx": { tai: 20, xiu: 80 },
  "ttxxtt": { tai: 75, xiu: 25 }, "txtxt": { tai: 60, xiu: 40 },
  "xtxtx": { tai: 40, xiu: 60 }, "ttx": { tai: 70, xiu: 30 },
  "xxt": { tai: 30, xiu: 70 }, "txt": { tai: 65, xiu: 35 },
  "xtx": { tai: 35, xiu: 65 }, "tttt": { tai: 85, xiu: 15 },
  "xxxx": { tai: 15, xiu: 85 }, "ttttt": { tai: 88, xiu: 12 },
  "xxxxx": { tai: 12, xiu: 88 }, "tttttt": { tai: 92, xiu: 8 },
  "xxxxxx": { tai: 8, xiu: 92 }, "tttx": { tai: 75, xiu: 25 },
  "xxxt": { tai: 25, xiu: 75 }, "ttxxtt": { tai: 80, xiu: 20 },
  "ttxtx": { tai: 78, xiu: 22 }, "xxtxt": { tai: 22, xiu: 78 },
  "txtxtx": { tai: 82, xiu: 18 }, "xtxtxt": { tai: 18, xiu: 82 },
  "ttxtxt": { tai: 85, xiu: 15 }, "xxtxtx": { tai: 15, xiu: 85 },
  "txtxxt": { tai: 83, xiu: 17 }, "xtxttx": { tai: 17, xiu: 83 },
  "ttttttt": { tai: 95, xiu: 5 }, "xxxxxxx": { tai: 5, xiu: 95 },
  "tttttttt": { tai: 97, xiu: 3 }, "xxxxxxxx": { tai: 3, xiu: 97 },
  "txtx": { tai: 60, xiu: 40 }, "xtxt": { tai: 40, xiu: 60 },
  "txtxt": { tai: 65, xiu: 35 }, "xtxtx": { tai: 35, xiu: 65 },
  "txtxtxt": { tai: 70, xiu: 30 }, "xtxtxtx": { tai: 30, xiu: 70 }
};

const SUNWIN_ALGORITHM = {
  "3-10": { tai: 0, xiu: 100 }, "11": { tai: 10, xiu: 90 },
  "12": { tai: 20, xiu: 80 }, "13": { tai: 35, xiu: 65 },
  "14": { tai: 45, xiu: 55 }, "15": { tai: 65, xiu: 35 },
  "16": { tai: 80, xiu: 20 }, "17": { tai: 90, xiu: 10 },
  "18": { tai: 100, xiu: 0 }
};

function connectWebSocket() {
  ws = new WebSocket("wss://websocket.atpman.net/websocket");

  ws.on("open", () => {
    console.log("✅ Đã kết nối WebSocket");

    const authPayload = [
      1,
      "MiniGame",
      "dfghhhgffgggg",
      "tinhbip",
      {
        info: "{\"ipAddress\":\"2402:9d80:36a:1716:13d7:a37a:60e2:2c64\",\"userId\":\"f68cd413-44d4-4bf5-96eb-23da9a317f17\",\"username\":\"S8_dfghhhgffgggg\",\"timestamp\":1752167805248,\"refreshToken\":\"498e236e749f4afdb8517d1cd23a419b.0ab31b9e397f4cf0b9c23b3d6a7596b6\"}",
        signature: "52830A25058B665F9A929FD75A80E6893BCD7DDB2BA3276B132BC863453AA09AE60B66FBE4B25F3892B27492391BF08F30D2DDD84B140F0007F1630BC6727A45543749ED892B94D78FEC9683FCF9A15F4EF582D8E4D9F7DD85AFD3BAE566A7B886F7DC380DA10EF5527C38BEE9E4F06C95B9612105CC1B2545C2A13644A29F1F"
      }
    ];

    ws.send(JSON.stringify(authPayload));
    console.log("🔐 Đã gửi payload xác thực");

    setTimeout(() => {
      const dicePayload = [
        6,
        "MiniGame",
        "taixiuUnbalancedPlugin",
        { cmd: 2000 }
      ];
      ws.send(JSON.stringify(dicePayload));
      console.log("🎲 Đã gửi lệnh lấy kết quả xúc xắc (cmd: 2000)");
    }, 2000);
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        lastResults = json[1].htr.map(item => ({
          sid: item.sid,
          d1: item.d1,
          d2: item.d2,
          d3: item.d3
        }));

        const latest = lastResults[0];
        const total = latest.d1 + latest.d2 + latest.d3;
        currentResult = total >= 11 ? "Tài" : "Xỉu";
        currentSession = latest.sid;

        console.log(`📥 Phiên ${currentSession}: ${latest.d1} + ${latest.d2} + ${latest.d3} = ${total} → ${currentResult}`);
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    console.warn("⚠️ WebSocket bị đóng, thử kết nối lại sau 5 giây...");
    setTimeout(connectWebSocket, reconnectInterval);
  });

  ws.on("error", (err) => {
    console.error("❌ Lỗi WebSocket:", err.message);
    ws.close();
  });
}

connectWebSocket();

fastify.get("/api/club789", async (request, reply) => {
  const validResults = [...lastResults]
    .reverse()
    .filter(item => item.d1 && item.d2 && item.d3);

  if (validResults.length < 1) {
    return {
      current_result: null,
      current_session: null,
      next_session: null,
      prediction: null,
      confidence: 0,
      used_pattern: ""
    };
  }

  const pattern = validResults
    .slice(0, 13)
    .map(item => {
      const sum = item.d1 + item.d2 + item.d3;
      return sum >= 11 ? "t" : "x";
    })
    .reverse()
    .join("");

  const current = validResults[0];
  const total = current.d1 + current.d2 + current.d3;
  const result = total >= 11 ? "Tài" : "Xỉu";
  const currentSession = current.sid;
  const nextSession = currentSession + 1;

  // === Dự đoán theo pattern
  let prediction = "Chờ";
  let confidence = 0;

  for (let len = 13; len >= 3; len--) {
    const sub = pattern.slice(-len);
    if (PATTERN_DATA[sub]) {
      const { tai, xiu } = PATTERN_DATA[sub];
      prediction = tai > xiu ? "Tài" : "Xỉu";
      confidence = Math.max(tai, xiu);
      break;
    }
  }

  return {
    current_result: result,
    current_session: currentSession,
    next_session: nextSession,
    prediction,
    confidence,
    used_pattern: pattern
  };
});

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Server đang chạy tại ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
