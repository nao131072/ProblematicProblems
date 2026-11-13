let questions = [];
let currentUser = null;
const isStaticSite =
  window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";
const staticQuestionsKey = "zhiwen-questions";
const staticUserKey = "zhiwen-user";

const questionList = document.querySelector("#question-list");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const askModal = document.querySelector("#ask-modal");
const loginModal = document.querySelector("#login-modal");

async function request(path, options = {}) {
  if (isStaticSite) return staticRequest(path, options);
  const response = await fetch(path + (options.query || ""), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "請求失敗，請稍後再試。");
  return payload;
}

function staticSerializeQuestion(question) {
  const answers = question.answers || [];
  return {
    ...question,
    excerpt: question.detail,
    statusLabel: { unanswered: "尚未回答", answered: "已有回答", solved: "已解決" }[question.status],
    answerCount: answers.length,
    date: relativeDate(question.createdAt),
  };
}

function staticQuestions() {
  const stored = localStorage.getItem(staticQuestionsKey);
  return stored ? JSON.parse(stored) : null;
}

async function staticRequest(path, options = {}) {
  const method = options.method || "GET";
  const requestUrl = new URL(path + (options.query || ""), window.location.origin);
  const pathname = requestUrl.pathname;
  const storedQuestions = staticQuestions();
  if (pathname === "/api/me") {
    return { user: JSON.parse(localStorage.getItem(staticUserKey) || "null") };
  }
  if (pathname === "/api/login" && method === "POST") {
    const body = JSON.parse(options.body || "{}");
    if (!body.name || !body.email) throw new Error("請填寫姓名與 Email。");
    const user = { id: crypto.randomUUID(), name: String(body.name).trim(), email: String(body.email).trim() };
    localStorage.setItem(staticUserKey, JSON.stringify(user));
    return { user };
  }
  if (pathname === "/api/logout" && method === "POST") {
    localStorage.removeItem(staticUserKey);
    return { user: null };
  }
  if (pathname === "/api/questions" && method === "GET") {
    const search = (requestUrl.searchParams.get("q") || "").toLowerCase();
    const status = requestUrl.searchParams.get("status") || "all";
    const topic = requestUrl.searchParams.get("topic") || "all";
    const sort = requestUrl.searchParams.get("sort") || "recent";
    const result = (storedQuestions || []).filter((question) => {
      const matchesSearch = !search ||
        `${question.title} ${question.detail} ${question.topic}`.toLowerCase().includes(search);
      return matchesSearch &&
        (status === "all" || question.status === status) &&
        (topic === "all" || question.topic === topic);
    });
    result.sort((left, right) => {
      if (sort === "active") return right.views - left.views;
      if (sort === "answers") return right.answers.length - left.answers.length;
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
    return { questions: result.map(staticSerializeQuestion) };
  }
  if (pathname === "/api/questions" && method === "POST") {
    const user = JSON.parse(localStorage.getItem(staticUserKey) || "null");
    if (!user) throw new Error("請先登入後再提問。");
    const body = JSON.parse(options.body || "{}");
    if (!body.title || !body.detail) throw new Error("請填寫問題標題與內容。");
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
    const nextQuestions = [...(storedQuestions || []), question];
    localStorage.setItem(staticQuestionsKey, JSON.stringify(nextQuestions));
    return { question: staticSerializeQuestion(question) };
  }
  const answerMatch = pathname.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if (method === "POST" && answerMatch) {
    const user = JSON.parse(localStorage.getItem(staticUserKey) || "null");
    if (!user) throw new Error("請先登入後再回答。");
    const body = JSON.parse(options.body || "{}");
    if (!body.content || !String(body.content).trim()) throw new Error("請填寫回答內容。");
    const nextQuestions = (storedQuestions || []).map((question) => {
      if (question.id !== answerMatch[1]) return question;
      return {
        ...question,
        status: question.status === "unanswered" ? "answered" : question.status,
        answers: [...question.answers, {
          id: `a-${crypto.randomUUID()}`,
          content: String(body.content).trim(),
          author: user.name,
          createdAt: new Date().toISOString(),
        }],
      };
    });
    if (!nextQuestions.some((question) => question.id === answerMatch[1])) {
      throw new Error("找不到這個問題。");
    }
    localStorage.setItem(staticQuestionsKey, JSON.stringify(nextQuestions));
    return { question: staticSerializeQuestion(nextQuestions.find((question) => question.id === answerMatch[1])) };
  }
  throw new Error("找不到 API 路徑。");
}

function relativeDate(isoDate) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

function showMessage(elementId, message) {
  const element = document.querySelector(`#${elementId}`);
  element.textContent = message;
  element.hidden = false;
}

function renderQuestions() {
  resultCount.textContent = `顯示 ${questions.length} 個問題`;
  emptyState.hidden = questions.length !== 0;
  questionList.innerHTML = questions
    .map(
      (question) => `
        <article class="question-card" data-question-id="${question.id}">
          <h3><a href="#question-${question.id}">${question.title}</a></h3>
          <p class="question-excerpt">${question.excerpt}</p>
          <div class="question-meta">
            <span class="tag">${question.topic}</span>
            <span class="status">${question.statusLabel}</span>
            <span>${question.answerCount} 個回答</span>
            <span>${question.views} 次瀏覽</span>
            <span>${question.date}</span>
            <span>提問：${question.author}</span>
          </div>
          ${
            question.answers.length
              ? `<div class="answers"><strong>精選回答</strong>${question.answers
                  .slice(0, 2)
                  .map((answer) => `<p>${answer.content}<small>— ${answer.author}</small></p>`)
                  .join("")}</div>`
              : ""
          }
          <form class="answer-form" data-answer-form>
            <label for="answer-${question.id}">你的回答</label>
            <textarea id="answer-${question.id}" name="content" rows="2" required placeholder="${currentUser ? "分享你的經驗或解法" : "登入後即可回答"}" ${currentUser ? "" : "disabled"}></textarea>
            <button class="button button-outline" type="submit" ${currentUser ? "" : "disabled"}>送出回答</button>
            <span class="inline-message" aria-live="polite"></span>
          </form>
        </article>
      `,
    )
    .join("");
}

async function loadQuestions() {
  const params = new URLSearchParams({
    q: searchInput.value.trim(),
    status: document.querySelector('input[name="status"]:checked').value,
    topic: document.querySelector('input[name="topic"]:checked').value,
    sort: sortSelect.value,
  });
  const payload = await request("/api/questions", { query: `?${params}` });
  questions = payload.questions;
  renderQuestions();
}

async function loadStaticSeed() {
  if (!isStaticSite || staticQuestions()) return;
  const response = await fetch("data/questions.json");
  if (!response.ok) throw new Error("無法載入問題資料。");
  localStorage.setItem(staticQuestionsKey, JSON.stringify(await response.json()));
}

async function loadCurrentUser() {
  const payload = await request("/api/me");
  currentUser = payload.user;
  const userElement = document.querySelector("#current-user");
  const loginButton = document.querySelector("#login-button");
  userElement.hidden = !currentUser;
  userElement.textContent = currentUser ? `你好，${currentUser.name}` : "";
  loginButton.textContent = currentUser ? "登出" : "登入";
  renderQuestions();
}

document.querySelector("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadQuestions();
  document.querySelector("#questions").scrollIntoView({ behavior: "smooth" });
});

document.querySelectorAll('input[name="status"], input[name="topic"]').forEach((input) => {
  input.addEventListener("change", loadQuestions);
});
sortSelect.addEventListener("change", loadQuestions);

document.querySelectorAll("[data-search]").forEach((button) => {
  button.addEventListener("click", async () => {
    searchInput.value = button.dataset.search;
    await loadQuestions();
    document.querySelector("#questions").scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll("[data-open-ask]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentUser) {
      loginModal.hidden = false;
      document.querySelector("#login-name").focus();
      return;
    }
    askModal.hidden = false;
    document.querySelector("#question-title").focus();
  });
});

document.querySelector("[data-close-ask]").addEventListener("click", () => { askModal.hidden = true; });
document.querySelector("[data-close-login]").addEventListener("click", () => { loginModal.hidden = true; });
document.querySelectorAll(".modal-backdrop").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.hidden = true;
  });
});

document.querySelector("#ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await request("/api/questions", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        topic: form.get("topic"),
        detail: form.get("detail"),
      }),
    });
    formElement.reset();
    askModal.hidden = true;
    await loadQuestions();
  } catch (error) {
    showMessage("form-message", error.message);
  }
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), email: form.get("email") }),
    });
    formElement.reset();
    loginModal.hidden = true;
    await loadCurrentUser();
  } catch (error) {
    showMessage("login-message", error.message);
  }
});

document.querySelector("#login-button").addEventListener("click", async (event) => {
  if (!currentUser) {
    loginModal.hidden = false;
    document.querySelector("#login-name").focus();
    return;
  }
  await request("/api/logout", { method: "POST" });
  await loadCurrentUser();
});

questionList.addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-answer-form]")) return;
  event.preventDefault();
  const card = event.target.closest("[data-question-id]");
  const message = card.querySelector(".inline-message");
  const form = new FormData(event.target);
  try {
    await request(`/api/questions/${card.dataset.questionId}/answers`, {
      method: "POST",
      body: JSON.stringify({ content: form.get("content") }),
    });
    await loadQuestions();
  } catch (error) {
    message.textContent = error.message;
  }
});

Promise.resolve(loadStaticSeed())
  .then(() => Promise.all([loadCurrentUser(), loadQuestions()]))
  .catch((error) => {
  resultCount.textContent = error.message;
  });
