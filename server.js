const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3060;

let lastResults = []; // Lưu kết quả các phiên gần nhất
let currentResult = null;
let currentSession = null;

let ws = null;
let reconnectInterval = 5000;

function getTaiXiu(total) {
  return total >= 11 ? "Tài" : "Xỉu";
}

function taiXiuStats(totalsList) {
  const Counter = require("collections/counter");
  const types = totalsList.map(getTaiXiu);
  const count = new Counter(types);
  const totalCounter = new Counter(totalsList);
  return {
    tai_count: count.get("Tài") || 0,
    xiu_count: count.get("Xỉu") || 0,
    most_common_total: totalCounter.max(),
    most_common_type: (count.get("Tài") || 0) >= (count.get("Xỉu") || 0) ? "Tài" : "Xỉu"
  };
}

function duDoanSunwin200kVIP(totalsList) {
  const last4 = totalsList.slice(-4);
  const last3 = totalsList.slice(-3);
  const last6 = totalsList.slice(-6);
  const lastTotal = totalsList[totalsList.length - 1];
  const lastResult = getTaiXiu(lastTotal);

  const rules = [
    () => {
      if (last4[0] === last4[2] && last4[0] === last4[3] && last4[0] !== last4[1]) {
        return {
          prediction: "Tài",
          confidence: 85,
          reason: `Cầu đặc biệt ${last4}. Bắt Tài theo công thức đặc biệt.`
        };
      }
    },
    () => {
      if (last3[0] === last3[2] && last3[0] !== last3[1]) {
        return {
          prediction: lastResult === "Tài" ? "Xỉu" : "Tài",
          confidence: 83,
          reason: `Cầu sandwich ${last3}. Bẻ cầu!`
        };
      }
    },
    () => {
      const specialNums = new Set([7, 9, 10]);
      const count = last3.filter(t => specialNums.has(t)).length;
      if (count >= 2) {
        return {
          prediction: lastResult === "Tài" ? "Xỉu" : "Tài",
          confidence: 81,
          reason: `Xuất hiện ≥2 số đặc biệt ${[...specialNums]} gần nhất. Bẻ cầu!`
        };
      }
    },
    () => {
      const freq = last6.filter(t => t === lastTotal).length;
      if (freq >= 3) {
        return {
          prediction: getTaiXiu(lastTotal),
          confidence: 80,
          reason: `Số ${lastTotal} lặp lại ${freq} lần. Bắt theo nghiêng cầu!`
        };
      }
    },
    () => {
      if (last3[0] === last3[2] || last3[1] === last3[2]) {
        return {
          prediction: lastResult === "Tài" ? "Xỉu" : "Tài",
          confidence: 77,
          reason: `Cầu lặp dạng ${last3}. Bẻ cầu theo dạng A-B-B hoặc A-B-A.`
        };
      }
    }
  ];

  for (const rule of rules) {
    const res = rule();
    if (res) {
      res.history_summary = taiXiuStats(totalsList);
      return res;
    }
  }

  return {
    prediction: lastResult === "Tài" ? "Xỉu" : "Tài",
    confidence: 71,
    reason: "Không có cầu đặc biệt nào, bẻ cầu mặc định theo 1-1.",
    history_summary: taiXiuStats(totalsList)
  };
}

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
        info: "{\"ipAddress\":\"::1\",\"userId\":\"id\",\"username\":\"S8_dfghhhgffgggg\",\"timestamp\":1234567890}",
        signature: "abc123"
      }
    ];
    ws.send(JSON.stringify(authPayload));

    setTimeout(() => {
      const dicePayload = [6, "MiniGame", "taixiuUnbalancedPlugin", { cmd: 2000 }];
      ws.send(JSON.stringify(dicePayload));
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
        currentResult = getTaiXiu(total);
        currentSession = latest.sid;

        console.log(`📥 Phiên ${currentSession}: ${latest.d1}+${latest.d2}+${latest.d3}=${total} → ${currentResult}`);
      }
    } catch {}
  });

  ws.on("close", () => {
    console.warn("⚠️ WebSocket đóng. Kết nối lại sau 5s...");
    setTimeout(connectWebSocket, reconnectInterval);
  });

  ws.on("error", (err) => {
    console.error("❌ Lỗi WebSocket:", err.message);
    ws.close();
  });
}

connectWebSocket();

fastify.get("/api/club789", async (request, reply) => {
  const validResults = [...lastResults].reverse().filter(item => item.d1 && item.d2 && item.d3);
  const totalsList = validResults.map(item => item.d1 + item.d2 + item.d3);
  const usedPattern = totalsList.slice(-13).map(getTaiXiu).join("");

  if (validResults.length < 4) {
    return {
      current_result: getTaiXiu(totalsList[totalsList.length - 1] || 0),
      current_session: validResults[0]?.sid || null,
      next_session: validResults[0]?.sid ? validResults[0].sid + 1 : null,
      prediction: "Chờ",
      confidence: 0,
      reason: "Chưa đủ dữ liệu",
      used_pattern: usedPattern
    };
  }

  const result = duDoanSunwin200kVIP(totalsList);
  const currentSession = validResults[0].sid;
  const nextSession = currentSession + 1;

  return {
    current_result: getTaiXiu(totalsList[totalsList.length - 1]),
    current_session: currentSession,
    next_session: nextSession,
    prediction: result.prediction,
    confidence: result.confidence,
    reason: result.reason,
    used_pattern: usedPattern,
    summary: result.history_summary
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
