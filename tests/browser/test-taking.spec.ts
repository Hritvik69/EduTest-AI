import { expect, test } from "@playwright/test";

const paper = {
  id: 123,
  title: "Class 10 Science Paper",
  status: "READY",
  isDemoMode: false,
  createdAt: new Date().toISOString(),
  config: {
    classNum: 10,
    subject: "Science",
    subjects: ["Science"],
    chapterIds: [1],
    totalMarks: 3,
    duration: 90,
    examType: "Practice",
    difficulty: "MEDIUM",
    questionTypes: ["SHORT"],
    typeDistribution: { SHORT: 1 },
    bloomDistribution: {
      REMEMBER: 15,
      UNDERSTAND: 20,
      APPLY: 30,
      ANALYZE: 20,
      EVALUATE: 10,
      CREATE: 5,
    },
    totalQuestions: 1,
  },
  blueprint: { sections: [], totalQuestions: 1, totalMarks: 3, estimatedTime: 90, competencyPercentage: 65 },
  questions: [
    {
      id: 999,
      text: "Explain the concept in two points.",
      type: "SHORT",
      difficulty: "MEDIUM",
      marks: 3,
      correctAnswer: "A model answer with two points.",
      explanation: "Rubric",
      bloomLevel: "UNDERSTAND",
      competencyLevel: 2,
      section: "Section B/C",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/papers/123", (route) =>
    route.fulfill({ json: paper }),
  );
  await page.route("**/api/attempts/save-progress", (route) =>
    route.fulfill({
      json: { saved: true, attemptId: 55, savedAt: new Date().toISOString() },
    }),
  );
  await page.route("**/api/evaluate-answers", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        attemptId: 77,
        paperId: body.paperId,
        totalScore: 2,
        maxScore: 3,
        percentage: 67,
        grade: "B2",
        timeTaken: body.timeTaken,
        questionResults: [],
        bloomScores: {},
        weakTopics: [],
        strongTopics: [],
        competencyScore: 0,
        recommendations: [],
        createdAt: new Date().toISOString(),
      },
    });
  });
});

test("restores autosaved answers and ignores shortcuts inside text inputs", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "edutest-answers-123",
      JSON.stringify({
        paperId: 123,
        answers: { "999": "restored answer" },
        visited: [0],
        marked: [],
        savedAt: new Date().toISOString(),
      }),
    );
  });

  await page.goto("/test/123");
  const answer = page.getByPlaceholder("Write your answer here");
  await expect(answer).toHaveValue("restored answer");

  await answer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Question 1 of 1")).toBeVisible();
});

test("submits the latest rapid typing value", async ({ page }) => {
  let submitted = "";
  let submittedQuestions: unknown = "not checked";
  await page.route("**/api/evaluate-answers", async (route) => {
    const body = route.request().postDataJSON();
    submitted = body.answers["999"];
    submittedQuestions = body.questions;
    await route.fulfill({
      json: {
        attemptId: 78,
        paperId: body.paperId,
        totalScore: 3,
        maxScore: 3,
        percentage: 100,
        grade: "A1",
        timeTaken: body.timeTaken,
        questionResults: [],
        bloomScores: {},
        weakTopics: [],
        strongTopics: [],
        competencyScore: 0,
        recommendations: [],
        createdAt: new Date().toISOString(),
      },
    });
  });

  await page.goto("/test/123");
  await page.getByPlaceholder("Write your answer here").fill("final answer after rapid typing");
  await page.getByRole("button", { name: /Submit Paper/i }).click();
  await page.getByRole("button", { name: /Submit & Get Results/i }).click();

  await expect.poll(() => submitted).toBe("final answer after rapid typing");
  expect(submittedQuestions).toBeUndefined();
});
