let questions = [];
let currentUser = null;

const questionList = document.querySelector("#question-list");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const askModal = document.querySelector("#ask-modal");
const loginModal = document.querySelector("#login-modal");

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "請求失敗，請稍後再試。");
  return payload;
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
  const payload = await request(`/api/questions?${params}`);
  questions = payload.questions;
  renderQuestions();
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

Promise.all([loadCurrentUser(), loadQuestions()]).catch((error) => {
  resultCount.textContent = error.message;
});
