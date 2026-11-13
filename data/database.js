const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "zhiwen.sqlite");
const seedPath = path.join(__dirname, "questions.json");
const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const count = database.prepare("SELECT COUNT(*) AS count FROM questions").get().count;
  if (count !== 0) return;

  const questions = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const insertQuestion = database.prepare(`
    INSERT INTO questions (id, title, detail, topic, status, author, created_at, views)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAnswer = database.prepare(`
    INSERT INTO answers (id, question_id, content, author, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    for (const question of questions) {
      insertQuestion.run(
        question.id,
        question.title,
        question.detail,
        question.topic,
        question.status,
        question.author,
        question.createdAt,
        question.views,
      );
      for (const answer of question.answers) {
        insertAnswer.run(answer.id, question.id, answer.content, answer.author, answer.createdAt);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getAnswers(questionId) {
  return database
    .prepare(`
      SELECT id, content, author, created_at AS createdAt
      FROM answers
      WHERE question_id = ?
      ORDER BY created_at ASC
    `)
    .all(questionId);
}

function mapQuestion(row) {
  return { ...row, answers: getAnswers(row.id) };
}

function listQuestions({ search = "", status = "all", topic = "all", sort = "recent" }) {
  const orderBy = {
    recent: "created_at DESC",
    active: "views DESC",
    answers: "(SELECT COUNT(*) FROM answers WHERE question_id = questions.id) DESC",
  }[sort] || "created_at DESC";
  const rows = database
    .prepare(`
      SELECT id, title, detail, topic, status, author, created_at AS createdAt, views
      FROM questions
      WHERE (? = '' OR LOWER(title || ' ' || detail || ' ' || topic) LIKE '%' || LOWER(?) || '%')
        AND (? = 'all' OR status = ?)
        AND (? = 'all' OR topic = ?)
      ORDER BY ${orderBy}
    `)
    .all(search, search, status, status, topic, topic);
  return rows.map(mapQuestion);
}

function findQuestion(id) {
  const row = database
    .prepare(`
      SELECT id, title, detail, topic, status, author, created_at AS createdAt, views
      FROM questions
      WHERE id = ?
    `)
    .get(id);
  return row ? mapQuestion(row) : null;
}

function createQuestion(question) {
  database
    .prepare(`
      INSERT INTO questions (id, title, detail, topic, status, author, created_at, views)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      question.id,
      question.title,
      question.detail,
      question.topic,
      question.status,
      question.author,
      question.createdAt,
      question.views,
    );
  return findQuestion(question.id);
}

function createAnswer(questionId, answer) {
  database
    .prepare(`
      INSERT INTO answers (id, question_id, content, author, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(answer.id, questionId, answer.content, answer.author, answer.createdAt);
  database.prepare("UPDATE questions SET status = 'answered' WHERE id = ? AND status = 'unanswered'").run(questionId);
  return findQuestion(questionId);
}

seedIfEmpty();

module.exports = {
  createAnswer,
  createQuestion,
  findQuestion,
  listQuestions,
};
