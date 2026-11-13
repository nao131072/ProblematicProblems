const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { createAnswer, createQuestion, findQuestion, listQuestions } = require("./data/database");

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const sessions = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": mimeTypes[".json"], ...headers });
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => {
        const [key, ...value] = cookie.trim().split("=");
        return [key, decodeURIComponent(value.join("="))];
      }),
  );
}

function currentUser(request) {
  const sessionId = parseCookies(request).session;
  return sessionId ? sessions.get(sessionId) : null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1000000) reject(new Error("Request body is too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function relativeDate(isoDate) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

function serializeQuestion(question) {
  return {
    ...question,
    excerpt: question.detail,
    statusLabel: { unanswered: "尚未回答", answered: "已有回答", solved: "已解決" }[question.status],
    answerCount: question.answers.length,
    date: relativeDate(question.createdAt),
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/me") {
    return sendJson(response, 200, { user: currentUser(request) });
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(request);
    if (!body.name || !body.email) return sendJson(response, 400, { error: "請填寫姓名與 Email。" });
    const user = { id: crypto.randomUUID(), name: String(body.name).trim(), email: String(body.email).trim() };
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, user);
    return sendJson(response, 200, { user }, {
      "Set-Cookie": `session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/`,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const sessionId = parseCookies(request).session;
    if (sessionId) sessions.delete(sessionId);
    return sendJson(response, 200, { user: null }, {
      "Set-Cookie": "session=; HttpOnly; Max-Age=0; SameSite=Lax; Path=/",
    });
  }

  if (request.method === "GET" && url.pathname === "/api/questions") {
    const questions = listQuestions({
      search: (url.searchParams.get("q") || "").trim(),
      status: url.searchParams.get("status") || "all",
      topic: url.searchParams.get("topic") || "all",
      sort: url.searchParams.get("sort") || "recent",
    });
    return sendJson(response, 200, { questions: questions.map(serializeQuestion) });
  }

  if (request.method === "POST" && url.pathname === "/api/questions") {
    const user = currentUser(request);
    if (!user) return sendJson(response, 401, { error: "請先登入後再提問。" });
    const body = await readBody(request);
    if (!body.title || !body.detail) return sendJson(response, 400, { error: "請填寫問題標題與內容。" });
    const question = {
      id: `q-${crypto.randomUUID()}`,
      title: String(body.title).trim(),
      detail: String(body.detail).trim(),
      topic: String(body.topic || "生活"),
      status: "unanswered",
      author: user.name,
      createdAt: new Date().toISOString(),
      views: 0,
      answers: [],
    };
    return sendJson(response, 201, { question: serializeQuestion(createQuestion(question)) });
  }

  const answerMatch = url.pathname.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if (request.method === "POST" && answerMatch) {
    const user = currentUser(request);
    if (!user) return sendJson(response, 401, { error: "請先登入後再回答。" });
    const body = await readBody(request);
    if (!body.content || !String(body.content).trim()) return sendJson(response, 400, { error: "請填寫回答內容。" });
    const question = findQuestion(answerMatch[1]);
    if (!question) return sendJson(response, 404, { error: "找不到這個問題。" });
    const answer = {
      id: `a-${crypto.randomUUID()}`,
      content: String(body.content).trim(),
      author: user.name,
      createdAt: new Date().toISOString(),
    };
    return sendJson(response, 201, { question: serializeQuestion(createAnswer(question.id, answer)) });
  }

  return sendJson(response, 404, { error: "找不到 API 路徑。" });
}

async function serveStatic(request, response, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "找不到檔案。" });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else await serveStatic(request, response, url);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`知問伺服器執行於 http://localhost:${port}`);
});
