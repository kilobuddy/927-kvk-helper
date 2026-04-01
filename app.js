const STORAGE_KEY = "kvk-prep-helper-state-v1";
const SLOT_COUNT = 48;
const SLOT_MINUTES = 30;
const hourlyOptions = Array.from({ length: 25 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

const speedupTypes = {
  autoApprove: "Auto Approve",
  generalSpeedups: "General",
  researchSpeedups: "Research",
  constructionSpeedups: "Construction",
  troopTrainingSpeedups: "Troop Training",
};

const defaultDayConfigs = [
  { id: "day1", label: "Day 1 - Construction", speedupKey: "constructionSpeedups" },
  { id: "day2", label: "Day 2 - Tech", speedupKey: "researchSpeedups" },
  { id: "day3", label: "Day 3 - Flexible", speedupKey: "autoApprove" },
  { id: "day4", label: "Day 4 - Troops", speedupKey: "troopTrainingSpeedups" },
  { id: "day5", label: "Day 5 - Last Day", speedupKey: "autoApprove" },
];

const samplePlayers = [
  { name: "[PNX]Mando", generalSpeedups: 13, researchSpeedups: 12, constructionSpeedups: 13, troopTrainingSpeedups: 22, preferredStart: "00:00", preferredEnd: "01:00" },
  { name: "[SKY]Tkilrey", generalSpeedups: 68, researchSpeedups: 8, constructionSpeedups: 15, troopTrainingSpeedups: 22, preferredStart: "00:00", preferredEnd: "01:00" },
  { name: "[927]Atlas", generalSpeedups: 40, researchSpeedups: 26, constructionSpeedups: 31, troopTrainingSpeedups: 18, preferredStart: "12:00", preferredEnd: "15:00" },
  { name: "[927]Nova", generalSpeedups: 28, researchSpeedups: 45, constructionSpeedups: 12, troopTrainingSpeedups: 16, preferredStart: "18:00", preferredEnd: "22:00" },
  { name: "[927]Kade", generalSpeedups: 22, researchSpeedups: 14, constructionSpeedups: 44, troopTrainingSpeedups: 7, preferredStart: "05:00", preferredEnd: "09:00" },
  { name: "[927]Sable", generalSpeedups: 16, researchSpeedups: 11, constructionSpeedups: 9, troopTrainingSpeedups: 39, preferredStart: "02:00", preferredEnd: "08:00" },
  { name: "[927]Mira", generalSpeedups: 54, researchSpeedups: 17, constructionSpeedups: 18, troopTrainingSpeedups: 12, preferredStart: "21:00", preferredEnd: "24:00" },
];

const state = loadState();

const playerForm = document.querySelector("#player-form");
const playersBody = document.querySelector("#players-body");
const daySettings = document.querySelector("#day-settings");
const scheduleOutput = document.querySelector("#schedule-output");
const scheduleSummary = document.querySelector("#schedule-summary");
const loadSampleButton = document.querySelector("#load-sample");
const clearAllButton = document.querySelector("#clear-all");
const importBulkButton = document.querySelector("#import-bulk");
const bulkInput = document.querySelector("#bulk-input");
const runSchedulerButton = document.querySelector("#run-scheduler");
const daySettingTemplate = document.querySelector("#day-setting-template");
const setFullDayButton = document.querySelector("#set-full-day");
const preferredStartSelect = document.querySelector("#preferredStart");
const preferredEndSelect = document.querySelector("#preferredEnd");

renderTimeSelects();
renderDaySettings();
renderPlayers();
renderSchedule(buildSchedule(state.players, state.dayConfigs));

playerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(playerForm);
  const player = {
    id: crypto.randomUUID(),
    name: String(formData.get("name") || "").trim(),
    generalSpeedups: toNumber(formData.get("generalSpeedups")),
    researchSpeedups: toNumber(formData.get("researchSpeedups")),
    constructionSpeedups: toNumber(formData.get("constructionSpeedups")),
    troopTrainingSpeedups: toNumber(formData.get("troopTrainingSpeedups")),
    preferredStart: String(formData.get("preferredStart") || ""),
    preferredEnd: String(formData.get("preferredEnd") || ""),
  };

  if (!isValidPlayer(player)) {
    window.alert("Please fill all fields with valid values. UTC windows use 1-hour intervals and the end must be after the start.");
    return;
  }

  state.players.push(player);
  persistState();
  playerForm.reset();
  renderTimeSelects();
  renderPlayers();
  renderSchedule(buildSchedule(state.players, state.dayConfigs));
});

loadSampleButton.addEventListener("click", () => {
  state.players = samplePlayers.map((player) => ({ ...player, id: crypto.randomUUID() }));
  persistState();
  renderPlayers();
  renderSchedule(buildSchedule(state.players, state.dayConfigs));
});

clearAllButton.addEventListener("click", () => {
  state.players = [];
  persistState();
  renderPlayers();
  renderSchedule(buildSchedule(state.players, state.dayConfigs));
});

setFullDayButton.addEventListener("click", () => {
  preferredStartSelect.value = "00:00";
  preferredEndSelect.value = "24:00";
});

importBulkButton.addEventListener("click", () => {
  const lines = bulkInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const imported = [];
  const invalid = [];

  lines.forEach((line, index) => {
    const [name, general, research, construction, troops, start, end] = line
      .split(",")
      .map((part) => part.trim());

    const player = {
      id: crypto.randomUUID(),
      name,
      generalSpeedups: toNumber(general),
      researchSpeedups: toNumber(research),
      constructionSpeedups: toNumber(construction),
      troopTrainingSpeedups: toNumber(troops),
      preferredStart: start,
      preferredEnd: end,
    };

    if (isValidPlayer(player)) {
      imported.push(player);
    } else {
      invalid.push(index + 1);
    }
  });

  if (imported.length) {
    state.players.push(...imported);
    persistState();
    renderPlayers();
    renderSchedule(buildSchedule(state.players, state.dayConfigs));
  }

  bulkInput.value = "";

  if (invalid.length) {
    window.alert(`Imported ${imported.length} players. Skipped invalid lines: ${invalid.join(", ")}.`);
  }
});

runSchedulerButton.addEventListener("click", () => {
  persistState();
  renderSchedule(buildSchedule(state.players, state.dayConfigs));
});

function renderDaySettings() {
  daySettings.innerHTML = "";

  state.dayConfigs.forEach((dayConfig) => {
    const fragment = daySettingTemplate.content.cloneNode(true);
    const wrapper = fragment.querySelector(".day-setting");
    const title = fragment.querySelector(".day-setting-title");
    const select = fragment.querySelector("select");

    title.textContent = dayConfig.label;

    Object.entries(speedupTypes).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = dayConfig.speedupKey === value;
      select.append(option);
    });

    select.addEventListener("change", (event) => {
      dayConfig.speedupKey = event.target.value;
      persistState();
      renderSchedule(buildSchedule(state.players, state.dayConfigs));
    });

    wrapper.dataset.dayId = dayConfig.id;
    daySettings.append(fragment);
  });
}

function renderTimeSelects() {
  preferredStartSelect.innerHTML = hourlyOptions
    .slice(0, -1)
    .map((time) => `<option value="${time}">${time}</option>`)
    .join("");

  preferredEndSelect.innerHTML = hourlyOptions
    .slice(1)
    .map((time) => `<option value="${time}">${time}</option>`)
    .join("");

  if (!preferredStartSelect.value) {
    preferredStartSelect.value = "00:00";
  }

  if (!preferredEndSelect.value) {
    preferredEndSelect.value = "02:00";
  }
}

function renderPlayers() {
  playersBody.innerHTML = "";

  if (!state.players.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7" class="empty-state">No players added yet.</td>';
    playersBody.append(row);
    return;
  }

  const sortedPlayers = [...state.players].sort(
    (left, right) => totalSpeedups(right) - totalSpeedups(left) || left.name.localeCompare(right.name),
  );

  sortedPlayers.forEach((player) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(player.name)}</td>
      <td>${formatDays(player.generalSpeedups)}</td>
      <td>${formatDays(player.researchSpeedups)}</td>
      <td>${formatDays(player.constructionSpeedups)}</td>
      <td>${formatDays(player.troopTrainingSpeedups)}</td>
      <td>${formatWindowLabel(player.preferredStart, player.preferredEnd)}</td>
      <td><button type="button" class="button-ghost" data-remove-id="${player.id}">Remove</button></td>
    `;
    playersBody.append(row);
  });

  playersBody.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.players = state.players.filter((player) => player.id !== button.dataset.removeId);
      persistState();
      renderPlayers();
      renderSchedule(buildSchedule(state.players, state.dayConfigs));
    });
  });
}

function buildSchedule(players, dayConfigs) {
  return dayConfigs.map((dayConfig) => {
    if (dayConfig.speedupKey === "autoApprove") {
      return {
        ...dayConfig,
        assignedCount: 0,
        openCount: 0,
        slots: [],
        overflow: [],
        autoApprove: true,
      };
    }

    const slotAssignments = maximizeAssignments(players, dayConfig.speedupKey);
    const slots = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
      const winner = slotAssignments[slotIndex] || null;

      return {
        slotIndex,
        timeLabel: formatSlot(slotIndex),
        player: winner,
        focusLabel: speedupTypes[dayConfig.speedupKey],
        focusValue: winner ? winner[dayConfig.speedupKey] : null,
      };
    });

    const assignedIds = new Set(slots.filter((slot) => slot.player).map((slot) => slot.player.id));
    const overflow = players
      .filter((player) => !assignedIds.has(player.id))
      .sort((left, right) => comparePlayersForDay(left, right, dayConfig.speedupKey));

    return {
      ...dayConfig,
      assignedCount: assignedIds.size,
      openCount: slots.filter((slot) => !slot.player).length,
      slots,
      overflow,
      autoApprove: false,
    };
  });
}

function renderSchedule(days) {
  const totalAssigned = days.reduce((sum, day) => sum + day.assignedCount, 0);
  const totalOpen = days.reduce((sum, day) => sum + day.openCount, 0);

  scheduleSummary.innerHTML = `
    <div class="summary-chip">Players: <strong>${state.players.length}</strong></div>
    <div class="summary-chip">Assignments: <strong>${totalAssigned}</strong></div>
    <div class="summary-chip">Open slots: <strong>${totalOpen}</strong></div>
  `;

  scheduleOutput.innerHTML = "";

  days.forEach((day) => {
    const card = document.createElement("article");
    card.className = "day-card";

    if (day.autoApprove) {
      card.innerHTML = `
        <header>
          <h3>${day.label}</h3>
          <p>Priority: Auto Approve</p>
        </header>
        <div class="auto-approve-panel">
          <p class="auto-approve-title">Auto approve day</p>
          <p class="auto-approve-copy">Whoever applies in game will get it. No schedule is generated for this day.</p>
        </div>
      `;

      scheduleOutput.append(card);
      return;
    }

    const slotItems = day.slots
      .map((slot) => {
        if (!slot.player) {
          return `
            <li class="slot-item empty">
              <span class="slot-time">${slot.timeLabel}</span>
              <span class="slot-player">Open slot</span>
              <span class="slot-meta">No available player inside this UTC window.</span>
            </li>
          `;
        }

        return `
          <li class="slot-item">
            <span class="slot-time">${slot.timeLabel}</span>
            <span class="slot-player">${escapeHtml(slot.player.name)}</span>
            <span class="slot-meta">${slot.focusLabel}: ${formatDays(slot.focusValue)} days | Preferred ${formatWindowLabel(slot.player.preferredStart, slot.player.preferredEnd)}</span>
          </li>
        `;
      })
      .join("");

    const overflowMarkup = day.overflow.length
      ? `
        <div class="overflow-panel">
          <p class="overflow-title">Unassigned Players</p>
          <div class="overflow-list">
            ${day.overflow
              .map(
                (player) => `
                  <span
                    class="overflow-chip"
                    title="General: ${formatDays(player.generalSpeedups)} days | Research: ${formatDays(player.researchSpeedups)} days | Construction: ${formatDays(player.constructionSpeedups)} days | Troops: ${formatDays(player.troopTrainingSpeedups)} days | Preferred: ${formatWindowLabel(player.preferredStart, player.preferredEnd)}"
                  >${escapeHtml(player.name)} (${formatDays(player[day.speedupKey])})</span>
                `,
              )
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="overflow-panel">
          <p class="overflow-title">Unassigned Players</p>
          <p class="overflow-empty">No overflow for this day.</p>
        </div>
      `;

    card.innerHTML = `
      <header>
        <h3>${day.label}</h3>
        <p>Priority: ${speedupTypes[day.speedupKey]} | Filled ${day.assignedCount}/48</p>
      </header>
      <ul class="slot-list">${slotItems}</ul>
      ${overflowMarkup}
    `;

    scheduleOutput.append(card);
  });
}

function comparePlayersForDay(left, right, speedupKey) {
  return (
    right[speedupKey] - left[speedupKey] ||
    windowLength(left) - windowLength(right) ||
    totalSpeedups(right) - totalSpeedups(left) ||
    left.preferredStart.localeCompare(right.preferredStart) ||
    left.name.localeCompare(right.name)
  );
}

function isSlotInsideWindow(slotIndex, start, end) {
  const slotStart = slotIndex * SLOT_MINUTES;
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);

  return slotStart >= startMinutes && slotStart < endMinutes;
}

function formatSlot(slotIndex) {
  const start = slotIndex * SLOT_MINUTES;
  const end = start + SLOT_MINUTES;
  return `${formatClock(start)} - ${formatClock(end)}`;
}

function formatClock(totalMinutes) {
  const wrappedMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(wrappedMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (wrappedMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatWindowLabel(start, end) {
  if (start === "00:00" && end === "24:00") {
    return "Full day UTC";
  }

  return `${start} - ${end}`;
}

function parseTime(value) {
  if (value === "24:00") {
    return 24 * 60;
  }

  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidTime(value) {
  if (value === "24:00") {
    return true;
  }

  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function totalSpeedups(player) {
  return (
    player.generalSpeedups +
    player.researchSpeedups +
    player.constructionSpeedups +
    player.troopTrainingSpeedups
  );
}

function windowLength(player) {
  const startMinutes = parseTime(player.preferredStart);
  const endMinutes = parseTime(player.preferredEnd);
  const rawMinutes = endMinutes - startMinutes;
  return rawMinutes > 0 ? rawMinutes : rawMinutes + 24 * 60;
}

function formatDays(value) {
  return Number(value).toFixed(value % 1 === 0 ? 0 : 1);
}

function toNumber(value) {
  return Number.parseFloat(String(value || ""));
}

function isValidPlayer(player) {
  return (
    player.name &&
    Number.isFinite(player.generalSpeedups) &&
    Number.isFinite(player.researchSpeedups) &&
    Number.isFinite(player.constructionSpeedups) &&
    Number.isFinite(player.troopTrainingSpeedups) &&
    player.generalSpeedups >= 0 &&
    player.researchSpeedups >= 0 &&
    player.constructionSpeedups >= 0 &&
    player.troopTrainingSpeedups >= 0 &&
    isValidTime(player.preferredStart) &&
    isValidTime(player.preferredEnd) &&
    parseTime(player.preferredStart) < parseTime(player.preferredEnd)
  );
}

function maximizeAssignments(players, speedupKey) {
  const candidatePlayers = [...players]
    .filter((player) => player[speedupKey] > 0)
    .sort((left, right) => comparePlayersForDay(left, right, speedupKey));

  const source = 0;
  const playerOffset = 1;
  const slotOffset = playerOffset + candidatePlayers.length;
  const sink = slotOffset + SLOT_COUNT;
  const graph = Array.from({ length: sink + 1 }, () => []);

  function addEdge(from, to, capacity, cost) {
    const forward = { to, rev: graph[to].length, capacity, cost };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
  }

  candidatePlayers.forEach((player, index) => {
    const playerNode = playerOffset + index;
    addEdge(source, playerNode, 1, 0);

    for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
      if (isSlotInsideWindow(slotIndex, player.preferredStart, player.preferredEnd)) {
        addEdge(playerNode, slotOffset + slotIndex, 1, -player[speedupKey]);
      }
    }
  });

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    addEdge(slotOffset + slotIndex, sink, 1, 0);
  }

  const assignments = Array(SLOT_COUNT).fill(null);

  while (true) {
    const distance = Array(sink + 1).fill(Infinity);
    const previousNode = Array(sink + 1).fill(-1);
    const previousEdge = Array(sink + 1).fill(-1);
    const inQueue = Array(sink + 1).fill(false);
    const queue = [source];

    distance[source] = 0;
    inQueue[source] = true;

    while (queue.length) {
      const node = queue.shift();
      inQueue[node] = false;

      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity <= 0) {
          return;
        }

        const nextDistance = distance[node] + edge.cost;

        if (nextDistance < distance[edge.to]) {
          distance[edge.to] = nextDistance;
          previousNode[edge.to] = node;
          previousEdge[edge.to] = edgeIndex;

          if (!inQueue[edge.to]) {
            queue.push(edge.to);
            inQueue[edge.to] = true;
          }
        }
      });
    }

    if (distance[sink] >= 0 || !Number.isFinite(distance[sink])) {
      break;
    }

    let current = sink;
    while (current !== source) {
      const node = previousNode[current];
      const edge = graph[node][previousEdge[current]];
      edge.capacity -= 1;
      graph[current][edge.rev].capacity += 1;
      current = node;
    }
  }

  candidatePlayers.forEach((player, index) => {
    const playerNode = playerOffset + index;
    graph[playerNode].forEach((edge) => {
      if (edge.to >= slotOffset && edge.to < sink && edge.capacity === 0) {
        assignments[edge.to - slotOffset] = player;
      }
    });
  });

  return assignments;
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      players: Array.isArray(saved.players) ? saved.players : [],
      dayConfigs: Array.isArray(saved.dayConfigs) && saved.dayConfigs.length === defaultDayConfigs.length
        ? saved.dayConfigs
        : structuredClone(defaultDayConfigs),
    };
  } catch (error) {
    return {
      players: [],
      dayConfigs: structuredClone(defaultDayConfigs),
    };
  }
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
