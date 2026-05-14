"use strict";

const TRIPMINE_RELATED = new Set([
  "Defuse Kit",
  "Radar Module: Tripmines",
  "Subspacial Barrier",
]);

const SHOP_ENDINGS = new Set([0, 3, 5, 8]);

const state = {
  upgrades: [],
  level: 1,
  money: 0,
  cap: 1,
  players: 1,
  difficulty: "Normal",
  locked: {},
  pending: {},
  everLocked: {},
  showAll: false,
};

const $ = (id) => document.getElementById(id);

function setOf(map, name) {
  if (!map[name]) map[name] = new Set();
  return map[name];
}

function lobbyType(cap) {
  if (cap <= 1) return "Solo";
  if (cap === 2) return "Duo";
  if (cap <= 8) return "Party";
  return "Party+";
}

function scaledPrice(base, players, lobby, difficulty) {
  let p = base * Math.sqrt(players);
  if (lobby === "Party+") p = p / 1.125;
  if (difficulty === "Extreme") p = p * 1.15;
  return Math.ceil(p);
}

function effectiveBase(upgrade, lobby, stackIndex, difficulty) {
  if (
    difficulty === "Casual" &&
    Array.isArray(upgrade.casual_stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.casual_stack_prices.length
  ) {
    return upgrade.casual_stack_prices[stackIndex - 1];
  }
  if (
    lobby === "Solo" &&
    Array.isArray(upgrade.solo_stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.solo_stack_prices.length
  ) {
    return upgrade.solo_stack_prices[stackIndex - 1];
  }
  if (
    Array.isArray(upgrade.stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.stack_prices.length
  ) {
    return upgrade.stack_prices[stackIndex - 1];
  }
  if (difficulty === "Casual" && typeof upgrade.casual_base_price === "number") {
    return upgrade.casual_base_price;
  }
  if (lobby === "Solo" && typeof upgrade.solo_base_price === "number") {
    return upgrade.solo_base_price;
  }
  return upgrade.base_price;
}

function shopsFromLevel(firstLevel, currentLevel) {
  if (currentLevel < firstLevel) return 0;
  let n = 0;
  for (let l = firstLevel; l <= currentLevel; l++) {
    if (SHOP_ENDINGS.has(l % 10)) n++;
  }
  return n;
}

function maxStack(upgrade) {
  return typeof upgrade.max_stack === "number" && upgrade.max_stack > 0
    ? upgrade.max_stack
    : 1;
}

function freeStacks(upgrade, lobby) {
  if (upgrade.name === "Paycheck" && (lobby === "Solo" || lobby === "Duo")) {
    return 1;
  }
  return 0;
}

function isCompatible(upgrade, lobby, difficulty) {
  if (upgrade.name === "Orb") return false;
  if (difficulty === "Casual" && TRIPMINE_RELATED.has(upgrade.name))
    return false;
  if (difficulty === "Casual" && upgrade.name === "Grace Wings") return false;
  const soloOrDuo = lobby === "Solo" || lobby === "Duo";
  if (soloOrDuo && upgrade.name === "Last Robloxian Standing") return false;
  if (!soloOrDuo && upgrade.name === "Adrenaline") return false;
  return true;
}

function requiresMet(upgrade) {
  if (!Array.isArray(upgrade.requires)) return true;
  for (const dep of upgrade.requires) {
    const depName = typeof dep === "string" ? dep : dep.name;
    const need = typeof dep === "string" ? 1 : dep.count || 1;
    const locked = state.locked[depName];
    if (!locked || locked.size < need) return false;
  }
  return true;
}

function isVisible(upgrade, lobby, difficulty) {
  return (
    isCompatible(upgrade, lobby, difficulty) && requiresMet(upgrade)
  );
}

function visibleRows() {
  const lobby = lobbyType(state.cap);
  const rows = [];

  for (const upgrade of state.upgrades) {
    if (!isCompatible(upgrade, lobby, state.difficulty)) continue;
    const applicable = requiresMet(upgrade);
    const shops = shopsFromLevel(upgrade.level, state.level);
    const available = applicable && shops > 0;
    if (!available && !state.showAll) continue;

    const firstBase = effectiveBase(upgrade, lobby, 1, state.difficulty);
    const firstPrice = scaledPrice(
      firstBase,
      state.players,
      lobby,
      state.difficulty,
    );

    rows.push({
      upgrade: upgrade,
      name: upgrade.name,
      level: upgrade.level,
      firstBase,
      firstPrice,
      category: upgrade.category,
      note: upgrade.note || "",
      shops,
      available,
      maxStack: maxStack(upgrade),
    });
  }

  rows.sort(
    (a, b) =>
      a.level - b.level ||
      a.firstPrice - b.firstPrice ||
      a.name.localeCompare(b.name),
  );

  return rows;
}

function visibleStackCount(name, max, shops, free = 0) {
  if (max <= 1) return 1;

  const locked = state.locked[name];
  const pending = state.pending[name];
  const memory = state.everLocked[name];

  let maxIdx = 0;
  for (const set of [locked, pending, memory]) {
    if (!set) continue;
    for (const i of set) if (i > maxIdx) maxIdx = i;
  }

  const active = (locked ? locked.size : 0) + (pending ? pending.size : 0);
  const want = Math.max(free + 1, maxIdx, active + free + 1);

  return Math.min(max, shops + free, want);
}

function totalPendingCost() {
  const lobby = lobbyType(state.cap);

  let total = 0;
  for (const u of state.upgrades) {
    const pending = state.pending[u.name];

    if (!pending || pending.size === 0) continue;
    if (!isVisible(u, lobby, state.difficulty)) continue;

    for (const i of pending) {
      const base = effectiveBase(u, lobby, i, state.difficulty);
      total += scaledPrice(base, state.players, lobby, state.difficulty);
    }
  }

  return total;
}

function totalSelectedCount() {
  let n = 0;
  for (const s of Object.values(state.pending)) n += s.size;
  return n;
}

function totalLockedCount() {
  let n = 0;
  for (const s of Object.values(state.locked)) n += s.size;
  return n;
}

function clickSlot(name, i) {
  const locked = setOf(state.locked, name);
  const pending = setOf(state.pending, name);
  const memory = setOf(state.everLocked, name);

  if (locked.has(i)) {
    locked.delete(i);
  } else if (pending.has(i)) {
    pending.delete(i);
  } else if (memory.has(i)) {
    locked.add(i);
  } else {
    pending.add(i);
  }
}

function lockPending() {
  const names = new Set([
    ...Object.keys(state.locked),
    ...Object.keys(state.pending),
    ...Object.keys(state.everLocked),
  ]);

  for (const name of names) {
    const locked = setOf(state.locked, name);
    const pending = setOf(state.pending, name);

    for (const i of pending) locked.add(i);
    pending.clear();

    state.everLocked[name] = new Set(locked);
  }
}

function clearSelections() {
  state.locked = {};
  state.pending = {};
  state.everLocked = {};
}

function resetRun() {
  if (!confirm("Reset run state?")) return;
  clearSelections();

  state.level = 1;
  state.money = 0;
  state.players = Math.min(state.players, state.cap);
  $("level").value = state.level;
  $("money").value = state.money;
  $("players").value = state.players;

  render();
}

// if it aint broken dont fix it
function render() {
  const lobby = lobbyType(state.cap);
  const rows = visibleRows();

  $("lobby").textContent = `Lobby: ${lobby}`;
  const cost = totalPendingCost();
  const remaining = state.money - cost;
  $("status").textContent =
    `Budget: ${state.money} | Cost: ${cost} | ` +
    (remaining >= 0 ? `Remaining: ${remaining}` : `Over budget: ${-remaining}`);

  const tbody = $("list").querySelector("tbody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const free = freeStacks(row.upgrade, lobby);
    if (!row.available) {
      for (let i = free + 1; i <= row.maxStack; i++) {
        const tr = document.createElement("tr");
        tr.classList.add("unavailable");
        const base = effectiveBase(row.upgrade, lobby, i, state.difficulty);
        const price = scaledPrice(base, state.players, lobby, state.difficulty);

        const nameCell = document.createElement("td");
        const stackLabel = row.maxStack > 1 ? ` [${i}/${row.maxStack}]` : "";
        nameCell.textContent = row.name + stackLabel;

        const lvlCell = document.createElement("td");
        lvlCell.className = "num";
        lvlCell.textContent = row.level;

        const baseCell = document.createElement("td");
        baseCell.className = "num";
        baseCell.textContent = base;

        const priceCell = document.createElement("td");
        priceCell.className = "num";
        priceCell.textContent = price;

        tr.append(nameCell, lvlCell, baseCell, priceCell);
        tbody.appendChild(tr);
      }
      continue;
    }

    const visibleN = visibleStackCount(row.name, row.maxStack, row.shops, free);
    const locked = state.locked[row.name];
    const pending = state.pending[row.name];
    for (let i = free + 1; i <= visibleN; i++) {
      const tr = document.createElement("tr");
      if (locked && locked.has(i)) tr.classList.add("locked");
      else if (pending && pending.has(i)) tr.classList.add("pending");

      const base = effectiveBase(row.upgrade, lobby, i, state.difficulty);
      const price = scaledPrice(base, state.players, lobby, state.difficulty);

      const nameCell = document.createElement("td");
      const stackLabel = row.maxStack > 1 ? ` [${i}/${row.maxStack}]` : "";
      nameCell.textContent = row.name + stackLabel;

      const lvCell = document.createElement("td");
      lvCell.className = "num";
      lvCell.textContent = row.level;

      const baseCell = document.createElement("td");
      baseCell.className = "num";
      baseCell.textContent = base;

      const priceCell = document.createElement("td");
      priceCell.className = "num";
      priceCell.textContent = price;

      tr.append(nameCell, lvCell, baseCell, priceCell);
      tr.addEventListener("click", () => {
        clickSlot(row.name, i);
        render();
      });
      tbody.appendChild(tr);
    }
  }
}

function bindInputs() {
  $("level").addEventListener("input", (e) => {
    state.level = Math.max(0, parseInt(e.target.value || "0", 10));
    render();
  });
  $("money").addEventListener("input", (e) => {
    state.money = Math.max(0, parseInt(e.target.value || "0", 10));
    render();
  });
  $("cap").addEventListener("input", (e) => {
    state.cap = Math.max(1, Math.min(20, parseInt(e.target.value || "1", 10)));
    $("players").max = state.cap;
    if (state.players > state.cap) {
      state.players = state.cap;
      $("players").value = state.players;
    }
    render();
  });
  $("players").addEventListener("input", (e) => {
    const clamped = Math.max(
      1,
      Math.min(state.cap, parseInt(e.target.value || "1", 10)),
    );
    state.players = clamped;
    if (parseInt(e.target.value || "0", 10) !== clamped) {
      e.target.value = clamped;
    }
    render();
  });
  $("difficulty").addEventListener("change", (e) => {
    state.difficulty = e.target.value;
    render();
  });
  $("showAll").addEventListener("change", (e) => {
    state.showAll = e.target.checked;
    render();
  });
  $("lock").addEventListener("click", () => {
    lockPending();
    render();
  });
  $("clear").addEventListener("click", () => {
    clearSelections();
    render();
  });
  $("reset").addEventListener("click", resetRun);
}

function resetForm() {
  $("level").value = state.level;
  $("money").value = state.money;
  $("cap").value = state.cap;
  $("players").max = state.cap;
  $("players").value = state.players;
  $("difficulty").value = state.difficulty;
  $("showAll").checked = state.showAll;
}

async function init() {
  //actually lmk if there is a better format for data
  const res = await fetch("upgrades.json");
  const data = await res.json();

  state.upgrades = [
    ...data.in_game.map((u) => ({ ...u, category: "in_game" })),
    ...data.exclusive.map((u) => ({ ...u, category: "exclusive" })),
  ];
  resetForm();
  bindInputs();
  render();
}

init();
