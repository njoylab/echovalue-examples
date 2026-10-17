// Browser code. It only talks to the local server; the EchoValue token
// lives on the server and is never included here.

const form = document.querySelector("#score-form");
const status = document.querySelector("#status");
const rows = document.querySelector("#rows");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function render(scores) {
  rows.replaceChildren(
    ...scores.map((entry, index) => {
      const tr = document.createElement("tr");
      const rank = document.createElement("td");
      const name = document.createElement("td");
      const score = document.createElement("td");
      rank.textContent = String(index + 1);
      name.textContent = entry.name;
      score.textContent = String(entry.score);
      tr.append(rank, name, score);
      return tr;
    }),
  );
}

async function loadScores() {
  try {
    const response = await fetch("/api/scores");
    const data = await response.json();
    render(data.scores ?? []);
  } catch {
    setStatus("Could not load the leaderboard.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");
  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name.value,
        score: Number(form.score.value),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error ?? "Something went wrong.", true);
      return;
    }
    render(data.scores ?? []);
    setStatus("Score saved.");
    form.reset();
  } catch {
    setStatus("Could not reach the server.", true);
  }
});

loadScores();
