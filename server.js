// server.js - FULL CODE HOÀN CHÍNH KẺT NỐI 789CLUB + DỰ ĐOÁN + API + package.json hỗ trợ

const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3060;

let lastResults = [];
let ws = null;
let reconnectInterval = 5000;

function getTaiXiu(total) {
  return total >= 11 ? "T" : "X";
}

function taiXiuStats(totalsList) {
  const types = totalsList.map(getTaiXiu);
  const count = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, { T: 0, X: 0 });
  const freqTotals = {};
  totalsList.forEach(t => freqTotals[t] = (freqTotals[t] || 0) + 1);
  const mostCommonTotal = Object.entries(freqTotals).sort((a, b) => b[1] - a[1])[0][0];
  return {
    tai_count: count.T,
    xiu_count: count.X,
    most_common_total: parseInt(mostCommonTotal),
    most_common_type: count.T >= count.X ? "Tài" : "Xỉu"
  };
}

function duDoanSunwin200kVip(totals) {
  if (totals.length < 4) {
    return {
      prediction: "Chờ",
      confidence: 0,
      reason: "Chưa đủ dữ liệu",
      history_summary: taiXiuStats(totals)
    };
  }
  const last = totals.slice(-1)[0];
  const result = getTaiXiu(last);
  return {
    prediction: result === "T" ? "Xỉu" : "Tài",
    confidence: 71,
    reason: "Mặc định bẻ cầu",
    history_summary: taiXiuStats(totals)
  };
}

function connectWebSocket() {
  ws = new WebSocket("wss://websocket.atpman.net/websocket");

  ws.on("open", () => {
    console.log("✅ WebSocket connected");
    const authPayload = [
      1,
      "MiniGame",
      "miss88",
      "vinhk122011",
      {
        info: JSON.stringify({
          ipAddress: "2001:ee0:4f91:2000:689d:c3f4:e10d:5bd7",
          userId: "daf3a573-8ac5-4db4-9717-256b848044af",
          username: "S8_miss88",
          timestamp: 1752071555947,
          refreshToken: "39d76d58fc7e4b819e097764af7240c8.34dcc325f1fc4e758e832c8f7a960224"
        }),
        signature: "01095CFB5D30CA4208D26E0582C3A04CB18CE1FA78EE41F1D0F63D6D3D368BC03B4007FC54AAC0A4A6BA89846C7D0ED6F4609C2976B6290C19629884ADCAD90C86B7F2C8D8CA582A077A7932D0F4F70FBBC6FEDD0B89C249373A310427565D140016FF46940B81FBEA894136D431BF4BAA3B9B66C692B55AD81657A535DD3612"
      }
    ];
    ws.send(JSON.stringify(authPayload));
    setTimeout(() => {
      ws.send(JSON.stringify([6, "MiniGame", "taixiuUnbalancedPlugin", { cmd: 2000 }]));
    }, 2000);
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        lastResults = json[1].htr.map(item => ({
          sid: item.sid,
          total: item.d1 + item.d2 + item.d3
        }));
        const latest = lastResults[0];
        console.log(`📥 Phiên ${latest.sid}: ${latest.total} → ${getTaiXiu(latest.total)}`);
      }
    } catch (e) {
      console.error("❌ Lỗi parse:", e.message);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ Mất kế nối. Kết nối lại...");
    setTimeout(connectWebSocket, reconnectInterval);
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err.message);
    ws.close();
  });
}

connectWebSocket();

fastify.get("/api/club789", async () => {
  const valid = lastResults.slice().reverse();
  const totals = valid.map(v => v.total);
  const prediction = duDoanSunwin200kVip(totals);
  const pattern = (totals.length >= 13 ? totals.slice(-13) : Array(13 - totals.length).fill(0).concat(totals)).map(getTaiXiu).join("");

  return {
    current_result: totals.length ? (getTaiXiu(totals[totals.length - 1]) === "T" ? "Tài" : "Xỉu") : null,
    current_session: valid[0]?.sid || null,
    next_session: valid[0]?.sid + 1 || null,
    prediction: prediction.prediction,
    confidence: prediction.confidence,
    reason: prediction.reason,
    used_pattern: pattern
  };
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, addr) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 Server running: ${addr}`);
});
