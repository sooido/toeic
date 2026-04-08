const form = document.getElementById("generator-form");
const statusBox = document.getElementById("status");
const resultBox = document.getElementById("result");
const actionsBox = document.getElementById("actions");
const gradeButton = document.getElementById("gradeButton");
const resetButton = document.getElementById("resetButton");
const generateButton = document.getElementById("generateButton");
const questionTemplate = document.getElementById("question-template");

let currentSet = null;

function getFocusValues() {
  return Array.from(document.querySelectorAll('input[name="focus"]:checked')).map(
    (element) => element.value
  );
}

function buildPrompt(payload) {
  const focusMap = {
    "subject-object": "questions that invert subject and object wording without changing the underlying answer",
    "cross-sentence": "questions that require predicting or inferring the next sentence or logical continuation",
    "timeline-trap": "questions that test effective dates, future policy changes, and what was true at an earlier time",
  };

  const selectedFocus = payload.focus.length
    ? payload.focus.map((key) => focusMap[key]).join("; ")
    : "balanced general reading comprehension";

  return `
You are creating a TOEIC-style English reading practice set for a Korean learner.

Return valid JSON only with this exact schema:
{
  "title": "string",
  "set_type": "single" | "double" | "mixed",
  "passages": [
    {
      "label": "Passage 1",
      "text": "string"
    }
  ],
  "questions": [
    {
      "id": 1,
      "type": "subject-object" | "cross-sentence" | "timeline-trap" | "general",
      "question": "string",
      "options": [
        {"key": "A", "text": "string"},
        {"key": "B", "text": "string"},
        {"key": "C", "text": "string"},
        {"key": "D", "text": "string"}
      ],
      "answer": "A",
      "explanation_ko": "string"
    }
  ],
  "coach_note_ko": "string"
}

Requirements:
- Create a ${payload.setType} reading set.
- Difficulty: ${payload.difficulty}.
- Passage length: ${payload.passageLength}.
- Number of questions: ${payload.questionCount}.
- The reading set must emphasize: ${selectedFocus}.
- Use natural business or daily-life English, similar to TOEIC Part 7.
- If the set type is double or mixed, include at least one time-based trap involving policy changes, effective dates, or events happening before a future change takes effect.
- Every question must have four choices.
- Wrong options should be plausible but clearly wrong if the learner tracks subject/object roles, sentence linkage, or timeline carefully.
- Explanations must be in Korean and explicitly point out why the trap works.
- Keep the English passages self-contained.
- Do not include markdown fences.
- Do not include any text before or after the JSON.

Additional request from the learner:
${payload.extraInstruction || "No extra instruction."}
  `.trim();
}

async function fetchProblemSet(payload) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "문제 생성에 실패했습니다.");
  }
  return data;
}

function setStatus(message, kind = "info") {
  statusBox.textContent = message;
  statusBox.className = "status";
  if (kind === "error") {
    statusBox.style.background = "rgba(169, 61, 49, 0.12)";
    statusBox.style.color = "#8f3024";
  } else {
    statusBox.style.background = "";
    statusBox.style.color = "";
  }
}

function renderSet(problemSet) {
  currentSet = problemSet;
  resultBox.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = problemSet.title;
  resultBox.appendChild(title);

  problemSet.passages.forEach((passage) => {
    const card = document.createElement("article");
    card.className = "passage-card";

    const heading = document.createElement("h3");
    heading.textContent = passage.label;
    card.appendChild(heading);

    const content = document.createElement("p");
    content.textContent = passage.text;
    card.appendChild(content);

    resultBox.appendChild(card);
  });

  const list = document.createElement("section");
  list.className = "question-list";

  problemSet.questions.forEach((question) => {
    const fragment = questionTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".question-card");
    const chip = fragment.querySelector(".chip");
    const questionText = fragment.querySelector(".question-text");
    const options = fragment.querySelector(".options");
    const feedback = fragment.querySelector(".feedback");

    chip.textContent = typeLabel(question.type);
    questionText.textContent = `${question.id}. ${question.question}`;
    feedback.dataset.answer = question.answer;
    feedback.dataset.explanation = question.explanation_ko;
    article.dataset.questionId = question.id;

    question.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `question-${question.id}`;
      radio.value = option.key;

      const text = document.createElement("span");
      text.textContent = `${option.key}. ${option.text}`;

      label.appendChild(radio);
      label.appendChild(text);
      options.appendChild(label);
    });

    list.appendChild(fragment);
  });

  resultBox.appendChild(list);

  const summary = document.createElement("section");
  summary.className = "summary-box";
  const coach = document.createElement("p");
  coach.textContent = `코치 노트: ${problemSet.coach_note_ko}`;
  summary.appendChild(coach);
  resultBox.appendChild(summary);

  resultBox.classList.remove("hidden");
  actionsBox.classList.remove("hidden");
}

function typeLabel(type) {
  const labels = {
    "subject-object": "주체/객체 함정",
    "cross-sentence": "문장 연결 추론",
    "timeline-trap": "시점 함정",
    general: "일반 독해",
  };
  return labels[type] || "독해";
}

function gradeAnswers() {
  if (!currentSet) {
    return;
  }

  let correctCount = 0;

  currentSet.questions.forEach((question) => {
    const selected = document.querySelector(`input[name="question-${question.id}"]:checked`);
    const card = document.querySelector(`[data-question-id="${question.id}"]`);
    const feedback = card.querySelector(".feedback");

    if (!selected) {
      feedback.className = "feedback incorrect";
      feedback.textContent = `선택한 답이 없습니다.\n정답: ${question.answer}\n해설: ${question.explanation_ko}`;
      feedback.classList.remove("hidden");
      return;
    }

    if (selected.value === question.answer) {
      correctCount += 1;
      feedback.className = "feedback correct";
      feedback.textContent = `정답입니다. (${question.answer})\n해설: ${question.explanation_ko}`;
    } else {
      feedback.className = "feedback incorrect";
      feedback.textContent = `오답입니다. 선택: ${selected.value} / 정답: ${question.answer}\n해설: ${question.explanation_ko}`;
    }

    feedback.classList.remove("hidden");
  });

  setStatus(`채점 완료: ${correctCount} / ${currentSet.questions.length} 정답`, "info");
}

function resetAll() {
  currentSet = null;
  resultBox.innerHTML = "";
  resultBox.classList.add("hidden");
  actionsBox.classList.add("hidden");
  form.reset();
  document.getElementById("model").value = "gpt-4.1-mini";
  document.querySelectorAll('input[name="focus"]').forEach((element) => {
    element.checked = true;
  });
  document.getElementById("difficulty").value = "medium";
  document.getElementById("setType").value = "single";
  document.getElementById("questionCount").value = 5;
  document.getElementById("passageLength").value = "medium";
  setStatus("설정을 입력하고 문제를 생성하세요.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    apiKey: document.getElementById("apiKey").value.trim(),
    model: document.getElementById("model").value.trim(),
    setType: document.getElementById("setType").value,
    difficulty: document.getElementById("difficulty").value,
    questionCount: Number(document.getElementById("questionCount").value),
    passageLength: document.getElementById("passageLength").value,
    focus: getFocusValues(),
    extraInstruction: document.getElementById("extraInstruction").value.trim(),
  };

  if (!payload.apiKey) {
    setStatus("API 키를 입력해 주세요.", "error");
    return;
  }

  if (!payload.focus.length) {
    setStatus("최소 한 개의 집중 훈련 포인트를 선택해 주세요.", "error");
    return;
  }

  setStatus("문제를 생성하는 중입니다. 시점 함정과 독해 포인트를 세밀하게 반영하고 있어요.");
  generateButton.disabled = true;

  try {
    const data = await fetchProblemSet({
      ...payload,
      prompt: buildPrompt(payload),
    });
    renderSet(data.problemSet);
    setStatus("문제가 생성되었습니다. 답을 골라서 바로 채점해 보세요.");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    generateButton.disabled = false;
  }
});

gradeButton.addEventListener("click", gradeAnswers);
resetButton.addEventListener("click", resetAll);
