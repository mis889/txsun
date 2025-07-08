// server.js
const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3003;

let hitResults = [];
let hitWS = null;
let hitInterval = null;

let FORMULA_WEIGHTS = Array(200).fill(1);
let PREDICTION_HISTORY = [];

function connectHitWebSocket() {
  hitWS = new WebSocket("wss://mynygwais.hytsocesk.com/websocket");

  hitWS.on("open", () => {
    const authPayload = [
      1, "MiniGame", "", "", {
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
          dice: [item.d1, item.d2, item.d3]
        }));
      }
    } catch {}
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

function analyze_patterns(last_results) {
  if (last_results.length < 5) return [null, "Chưa đủ dữ liệu"];

  for (let window = 2; window <= 5; window++) {
    for (let start = 0; start <= last_results.length - window * 2; start++) {
      const seq = last_results.slice(start, start + window);
      const nextSeq = last_results.slice(start + window, start + window * 2);
      if (seq.join() === nextSeq.join()) {
        return [seq.at(-1), `Cầu tuần hoàn ${window}nút (${seq.join("-")})`];
      }
    }
  }

  const short = last_results.slice(0, 6);
  if (short.every(r => r === short[0])) return [short[0], "Cầu đặc biệt: Bệt dài"];
  if (short.every((r, i, arr) => i === 0 || r !== arr[i - 1])) return [short[0] === "Xỉu" ? "Tài" : "Xỉu", "Cầu đặc biệt: Đảo đều"];
  const ratioT = short.filter(r => r === "Tài").length / short.length;
  if (ratioT > 0.7 || ratioT < 0.3) return [ratioT > 0.7 ? "Tài" : "Xỉu", "Cầu đặc biệt: Cầu nghiên"];

  return [null, "Không phát hiện cầu"];
}

function analyze_big_streak(history) {
  const seq = history.map(h => h.result);
  let count = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) count++;
    else break;
  }
  if (count >= 4) return [seq[0], 85 + (count - 4) * 3];
  return [null, 0];
}

function predict_next(history, vip_mode = false) {
  if (history.length < 5) return ["Tài", 50];

  const last_results = history.map(h => h.result);
  const totals = history.map(h => h.total);
  const all_dice = history.flatMap(h => h.dice);
  const dice_freq = Array.from({ length: 6 }, (_, i) => all_dice.filter(d => d === i + 1).length);
  const avg_total = totals.reduce((a, b) => a + b, 0) / totals.length;

  let predictions = [];

  if (vip_mode) {
    predictions.push((totals.at(-1) + totals.at(-2)) % 2 === 0 ? "Tài" : "Xỉu");
    predictions.push(avg_total > 10.5 ? "Tài" : "Xỉu");
    predictions.push(dice_freq[4] + dice_freq[5] > dice_freq[0] + dice_freq[1] ? "Tài" : "Xỉu");
    predictions.push(totals.filter(t => t > 10).length > totals.length / 2 ? "Tài" : "Xỉu");
    predictions.push(totals.slice(-3).reduce((a, b) => a + b, 0) > 33 ? "Tài" : "Xỉu");
    while (predictions.length < 20) predictions.push(Math.random() > 0.5 ? "Tài" : "Xỉu");
  } else {
    predictions = [
      totals.slice(-3).reduce((a, b) => a + b, 0) > 30 ? "Tài" : "Xỉu",
      last_results.filter(r => r === "Tài").length > last_results.length / 2 ? "Tài" : "Xỉu",
      totals.at(-1) > avg_total ? "Tài" : "Xỉu",
      totals.at(-1) > 10 && totals.at(-2) > 10 ? "Tài" : "Xỉu",
      totals.at(-1) < 10 && totals.at(-2) < 10 ? "Xỉu" : "Tài"
    ];
  }

  let tai_votes = 0, xiu_votes = 0;
  predictions.forEach((p, i) => {
    const w = FORMULA_WEIGHTS[i] || 1;
    if (p === "Tài") tai_votes += w;
    else xiu_votes += w;
  });

  const [pattern_pred, pattern_desc] = analyze_patterns(last_results);
  if (vip_mode && pattern_pred) {
    const weight = pattern_desc.includes("Bệt") || pattern_desc.includes("tuần hoàn") ? 3 : 2;
    if (pattern_pred === "Tài") tai_votes += weight;
    else xiu_votes += weight;
  }

  const [streak_pred, streak_conf] = analyze_big_streak(history);
  if (streak_pred && streak_conf > 85) {
    if (streak_pred === "Tài") tai_votes += 5;
    else xiu_votes += 5;
  }

  const totalVotes = tai_votes + xiu_votes;
  const confidence = totalVotes > 0 ? Math.round((Math.max(tai_votes, xiu_votes) / totalVotes) * 100) : 50;
  const final = tai_votes > xiu_votes ? "Tài" : "Xỉu";

  PREDICTION_HISTORY.push({
    timestamp: Date.now(),
    result: final,
    confidence,
    formulas: predictions
  });

  return [final, confidence];
}

function update_formula_weights(actual_result) {
  if (PREDICTION_HISTORY.length < 1) return;
  const last = PREDICTION_HISTORY.at(-1);
  last.formulas.forEach((pred, i) => {
    if (pred === actual_result) {
      FORMULA_WEIGHTS[i] = Math.min(FORMULA_WEIGHTS[i] + 0.1, 3.0);
    } else {
      FORMULA_WEIGHTS[i] = Math.max(FORMULA_WEIGHTS[i] - 0.05, 0.1);
    }
  });
}

fastify.get("/api/hit", async (request, reply) => {
  const valid = hitResults.filter(item => item.d1 && item.d2 && item.d3);
  if (valid.length < 1) {
    return {
      current_result: null,
      current_session: null,
      next_session: null,
      prediction: null,
      confidence: null,
      used_pattern: ""
    };
  }

  const history = [...valid].reverse();
  const current = history[0];
  const [predicted, confidence] = predict_next(history, true);

  return {
    current_result: current.result,
    current_session: current.sid,
    next_session: current.sid + 1,
    prediction: predicted,
    confidence,
    used_pattern: analyze_patterns(history.map(h => h.result))[1]
  };
});

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server chạy ở ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
