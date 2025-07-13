const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3060;

let lastResults = [];
let currentResult = null;
let currentSession = null;

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
  }, { "T": 0, "X": 0 });

  const freqTotals = {};
  totalsList.forEach(t => freqTotals[t] = (freqTotals[t] || 0) + 1);
  const mostCommonTotal = Object.entries(freqTotals).sort((a, b) => b[1] - a[1])[0][0];

  return {
    tai_count: count["T"],
    xiu_count: count["X"],
    most_common_total: parseInt(mostCommonTotal),
    most_common_type: count["T"] >= count["X"] ? "Tài" : "Xỉu"
  };
}

function rule_special_pattern(last4) {
  if (last4[0] === last4[2] && last4[0] === last4[3] && last4[0] !== last4[1]) {
    return {
      prediction: "Tài",
      confidence: 85,
      reason: `Cầu đặc biệt ${last4}. Bắt Tài theo công thức đặc biệt.`
    };
  }
}

function rule_sandwich(last3, lastResult) {
  if (last3[0] === last3[2] && last3[0] !== last3[1]) {
    return {
      prediction: lastResult === "T" ? "Xỉu" : "Tài",
      confidence: 83,
      reason: `Cầu sandwich ${last3}. Bẻ cầu!`
    };
  }
}

function rule_special_numbers(last3, lastResult) {
  const special = new Set([7, 9, 10]);
  const count = last3.filter(t => special.has(t)).length;
  if (count >= 2) {
    return {
      prediction: lastResult === "T" ? "Xỉu" : "Tài",
      confidence: 81,
      reason: `Xuất hiện ≥2 số đặc biệt gần nhất. Bẻ cầu!`
    };
  }
}

function rule_frequent_repeat(last6, lastTotal) {
  const freq = last6.filter(t => t === lastTotal).length;
  if (freq >= 3) {
    return {
      prediction: getTaiXiu(lastTotal),
      confidence: 80,
      reason: `Số ${lastTotal} lặp lại ${freq} lần. Bắt theo nghiêng cầu!`
    };
  }
}

function rule_repeat_pattern(last3, lastResult) {
  if (last3[0] === last3[2] || last3[1] === last3[2]) {
    return {
      prediction: lastResult === "T" ? "Xỉu" : "Tài",
      confidence: 77,
      reason: `Cầu lặp dạng ${last3}. Bẻ cầu theo dạng A-B-B hoặc A-B-A.`
    };
  }
}

function rule_default(lastResult) {
  return {
    prediction: lastResult === "T" ? "Xỉu" : "Tài",
    confidence: 71,
    reason: "Không có cầu đặc biệt nào, bẻ cầu mặc định theo 1-1."
  };
}

function duDoanSunwin200kVip(totals) {
  if (totals.length < 4) {
    return {
      prediction: "Chờ",
      confidence: 0,
      reason: "Chưa đủ dữ liệu, cần ít nhất 4 phiên.",
      history_summary: taiXiuStats(totals)
    };
  }

  const last4 = totals.slice(-4);
  const last3 = totals.slice(-3);
  const last6 = totals.slice(-6);
  const lastTotal = totals[totals.length - 1];
  const lastResult = getTaiXiu(lastTotal);

  const rules = [
    () => rule_special_pattern(last4),
    () => rule_sandwich(last3, lastResult),
    () => rule_special_numbers(last3, lastResult),
    () => rule_frequent_repeat(last6, lastTotal),
    () => rule_repeat_pattern(last3, lastResult),
  ];

  for (const rule of rules) {
    const result = rule();
    if (result) {
      result.history_summary = taiXiuStats(totals);
      return result;
    }
  }

  const result = rule_default(lastResult);
  result.history_summary = taiXiuStats(totals);
  return result;
}

function connectWebSocket() {
  ws = new WebSocket("wss://websocket.atpman.net/websocket");

  ws.on("open", () => {
    console.log("✅ Đã kết nối WebSocket");

    const authPayload = [
      1,
      "MiniGame",
      "miss88",
      "vinhk122011",
      {
        info: "{\"ipAddress\":\"2001:ee0:4f91:2000:689d:c3f4:e10d:5bd7\",\"userId\":\"daf3a573-8ac5-4db4-9717-256b848044af\",\"username\":\"S8_miss88\",\"timestamp\":1752071555947,\"refreshToken\":\"39d76d58fc7e4b819e097764af7240c8.34dcc325f1fc4e758e832c8f7a960224\"}",
        signature: "01095CFB5D30CA4208D26E0582C3A04CB18CE1FA78EE41F1D0F63D6D3D368BC03B4007FC54AAC0A4A6BA89846C7D0ED6F4609C2976B6290C19629884ADCAD90C86B7F2C8D8CA582A077A7932D0F4F70FBBC6FEDD0B89C249373A310427565D140016FF46940B81FBEA894136D431BF4BAA3B9B66C692B55AD81657A535DD3612"
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
          total: item.d1 + item.d2 + item.d3
        }));

        const latest = lastResults[0];
        currentResult = getTaiXiu(latest.total);
        currentSession = latest.sid;

        console.log(`📥 Phiên ${currentSession}: Tổng = ${latest.total} → ${currentResult}`);
      }
    } catch (e) {
      console.error("❌ Lỗi parse WebSocket:", e.message);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ WebSocket bị đóng. Kết nối lại sau 5 giây...");
    setTimeout(connectWebSocket, reconnectInterval);
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err.message);
    ws.close();
  });
}

connectWebSocket();

fastify.get("/api/club789", async (request, reply) => {
  const valid = lastResults.slice().reverse();
  const totals = valid.map(v => v.total);

  if (totals.length < 1) {
    return {
      current_result: null,
      current_session: null,
      next_session: null,
      prediction: null,
      confidence: 0,
      reason: "Chưa có dữ liệu",
      used_pattern: ""
    };
  }

  const predictionData = duDoanSunwin200kVip(totals);

  const pattern = (totals.length >= 13
    ? totals.slice(-13)
    : Array(13 - totals.length).fill(0).concat(totals)
  ).map(getTaiXiu).join("");

  return {
    current_result: getTaiXiu(totals[totals.length - 1]) === "T" ? "Tài" : "Xỉu",
    current_session: valid[0].sid,
    next_session: valid[0].sid + 1,
    prediction: predictionData.prediction,
    confidence: predictionData.confidence,
    reason: predictionData.reason,
    used_pattern: pattern
  };
});

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Server đang chạy tại ${address}`);
  } catch (err) {
    console.error("❌ Lỗi khởi động server:", err.message);
    process.exit(1);
  }
};

start();
