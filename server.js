// server.js
const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3003;

let hitResults = [];
let hitWS = null;
let hitInterval = null;

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function connectHitWebSocket() {
  hitWS = new WebSocket("wss://mynygwais.hytsocesk.com/websocket");

  hitWS.on("open", () => {
    const authPayload = [
      1,
      "MiniGame",
      "",
      "",
      {
        agentId: "1",
        accessToken: "1-87eb5bcde00a1f5b3de92664a0ff9f91",
        reconnect: true,
      },
    ];
    hitWS.send(JSON.stringify(authPayload));

    clearInterval(hitInterval);
    hitInterval = setInterval(() => {
      const taiXiuPayload = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
      hitWS.send(JSON.stringify(taiXiuPayload));
    }, 5000);
  });

  hitWS.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        hitResults = json[1].htr.map((item) => ({
          sid: item.sid,
          d1: item.d1,
          d2: item.d2,
          d3: item.d3,
          total: item.d1 + item.d2 + item.d3,
          result: item.d1 + item.d2 + item.d3 >= 11 ? "Tài" : "Xỉu",
          dice: [item.d1, item.d2, item.d3],
        }));
      }
    } catch (e) {}
  });

  hitWS.on("close", () => {
    clearInterval(hitInterval);
    setTimeout(connectHitWebSocket, 5000);
  });

  hitWS.on("error", () => {
    hitWS.close();
  });
}

connectHitWebSocket();

const PREDICTION_HISTORY = [];
let FORMULA_WEIGHTS = Array(200).fill(1);
const PATTERN_DATA = {};
const SUNWIN_ALGORITHM = {};

function analyze_patterns(last_results) {
  if (last_results.length < 5) return [null, "Chưa đủ dữ liệu phân tích"];
  const detected_patterns = [];

  for (let window = 2; window < 6; window++) {
    for (let start = 0; start <= last_results.length - window * 2; start++) {
      const sequence = last_results.slice(start, start + window);
      const next_sequence = last_results.slice(start + window, start + window * 2);
      if (sequence.join() === next_sequence.join()) {
        detected_patterns.push([sequence[sequence.length - 1], `Cầu tuần hoàn ${window}nút (${sequence.join("-")})`]);
      }
    }
  }

  const special_patterns = {
    "Bệt dài": (seq) => seq.length >= 5 && new Set(seq).size === 1,
    "Đảo đều": (seq) => seq.length >= 4 && seq.every((v, i, arr) => i === 0 || v !== arr[i - 1]),
    "Cầu nghiêng": (seq) => seq.length >= 5 && (seq.filter(x => x === "Tài").length / seq.length > 0.7 || seq.filter(x => x === "Xỉu").length / seq.length > 0.7)
  };

  for (let [name, fn] of Object.entries(special_patterns)) {
    if (fn(last_results.slice(0, 6))) {
      const pred = name.includes("Đảo") && last_results[0] === "Xỉu" ? "Tài" : last_results[0];
      detected_patterns.push([pred, `Cầu đặc biệt: ${name}`]);
    }
  }
  return detected_patterns[0] || [null, "Không phát hiện cầu rõ ràng"];
}

function analyze_big_streak(history) {
  let current_result = history[0]?.result;
  let current_streak = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i].result === current_result) current_streak++;
    else break;
  }
  if (current_streak >= 3) {
    const last_total = history[0].total;
    let confidence = current_result === "Tài"
      ? (last_total >= 17 ? Math.min(95 + (current_streak - 3) * 5, 99) : Math.min(90 + (current_streak - 3) * 5, 98))
      : (last_total <= 10 ? Math.min(95 + (current_streak - 3) * 5, 99) : Math.min(90 + (current_streak - 3) * 5, 98));
    return [current_result, confidence];
  }
  return [null, 0];
}

function analyze_sum_trend(history) {
  const last_sum = history[0].total;
  const data = SUNWIN_ALGORITHM[last_sum.toString()];
  if (data) {
    if (data.tai === 100) return ["Tài", 95];
    if (data.xiu === 100) return ["Xỉu", 95];
    return [data.tai > data.xiu ? "Tài" : "Xỉu", Math.max(data.tai, data.xiu)];
  }
  return [null, 0];
}

function find_closest_pattern(current) {
  return Object.keys(PATTERN_DATA).find((k) => current.endsWith(k));
}

function analyze_pattern_trend(history) {
  const elements = history.slice(0, 15).map(s => s.result === "Tài" ? "t" : "x");
  const current_pattern = elements.reverse().join("");
  const closest = find_closest_pattern(current_pattern);
  if (closest && PATTERN_DATA[closest]) {
    const data = PATTERN_DATA[closest];
    if (data.tai === data.xiu) {
      return [history[0].total >= 11 ? "Tài" : "Xỉu", 55];
    }
    return [data.tai > data.xiu ? "Tài" : "Xỉu", Math.max(data.tai, data.xiu)];
  }
  return [null, 0];
}

function predict_next(history, vip_mode = false) {
  const last_results = history.map(h => h.result);
  const totals = history.map(h => h.total);
  const all_dice = history.flatMap(h => h.dice);
  const dice_freq = Array.from({ length: 6 }, (_, i) => all_dice.filter(d => d === i + 1).length);
  const avg_total = mean(totals);

  let predictions = [];
  if (vip_mode) {
    predictions = ["Tài", "Xỉu", "Tài"];
  } else {
    predictions = [
      totals.slice(0, 3).reduce((a, b) => a + b, 0) > 30 ? "Tài" : "Xỉu",
      last_results.filter(r => r === "Tài").length > last_results.filter(r => r === "Xỉu").length ? "Tài" : "Xỉu",
      totals[0] > avg_total ? "Tài" : "Xỉu",
      totals[0] > 10 && totals[1] > 10 ? "Tài" : "Xỉu",
      totals[0] < 10 && totals[1] < 10 ? "Xỉu" : "Tài",
    ];
  }

  const tai_votes = predictions.filter(p => p === "Tài").length;
  const xiu_votes = predictions.filter(p => p === "Xỉu").length;

  let [pattern_pred, pattern_desc] = analyze_patterns(last_results);
  if (vip_mode && pattern_pred) {
    if (pattern_pred === "Tài") tai_votes += 2;
    else xiu_votes += 2;
  }

  let [streak_pred, streak_conf] = analyze_big_streak(history);
  if (streak_pred && streak_conf > 85) {
    if (streak_pred === "Tài") tai_votes += 5;
    else xiu_votes += 5;
  }

  let [sum_pred, sum_conf] = analyze_sum_trend(history);
  if (sum_pred && sum_conf > 80) {
    if (sum_pred === "Tài") tai_votes += 3;
    else xiu_votes += 3;
  }

  let [pattern_trend_pred, pattern_trend_conf] = analyze_pattern_trend(history);
  if (pattern_trend_pred) {
    if (pattern_trend_pred === "Tài") tai_votes += 1;
    else xiu_votes += 1;
  }

  const total = tai_votes + xiu_votes;
  const confidence = total > 0 ? Math.round((Math.max(tai_votes, xiu_votes) / total) * 100) : 50;
  const final_prediction = tai_votes > xiu_votes ? "Tài" : "Xỉu";

  return [final_prediction, confidence];
}

fastify.get("/api/hit", async (request, reply) => {
  const validResults = [...hitResults].reverse().filter((item) => item.d1 && item.d2 && item.d3);
  if (validResults.length < 5) {
    return { prediction: null, confidence: 0 };
  }
  const [prediction, confidence] = predict_next(validResults, true);
  return {
    current_session: validResults[0].sid,
    current_result: validResults[0].result,
    prediction,
    confidence,
  };
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
});
