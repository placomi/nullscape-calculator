"use strict";

const TRIPMINE_RELATED = new Set([
  "Defuse Kit",
  "Radar Module: Tripmines",
]);

const SHOP_ENDINGS = new Set([0, 3, 5, 8]);

const HIDDEN_UPGRADES = new Set(["Real Wings", "Blossom"]);

const state = {
  upgrades: [],
  level: 3,
  money: 0,
  cap: 8,
  players: 1,
  difficulty: "Standard",
  obtained: {},
  selected: new Set(),
  showAll: true,
  nothing: false,
  autoAdvance: true,
};

const $ = (id) => document.getElementById(id);

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
  if (state.nothing) p = p * 0.85;
  return Math.ceil(p);
}

function effectiveBase(upgrade, lobby, stackIndex, difficulty) {
  if (
    lobby === "Solo" &&
    Array.isArray(upgrade.solo_stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.solo_stack_prices.length
  ) {
    return upgrade.solo_stack_prices[stackIndex - 1];
  }
  if (
    difficulty === "Casual" &&
    Array.isArray(upgrade.casual_stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.casual_stack_prices.length
  ) {
    return upgrade.casual_stack_prices[stackIndex - 1];
  }
  if (
    Array.isArray(upgrade.stack_prices) &&
    stackIndex >= 1 &&
    stackIndex <= upgrade.stack_prices.length
  ) {
    return upgrade.stack_prices[stackIndex - 1];
  }
  if (lobby === "Solo" && typeof upgrade.solo_base_price === "number") {
    return upgrade.solo_base_price;
  }
  if (
    difficulty === "Casual" &&
    typeof upgrade.casual_base_price === "number"
  ) {
    return upgrade.casual_base_price;
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

function nextShopLevel(level) {
  let l = level + 1;
  while (!SHOP_ENDINGS.has(l % 10)) l++;
  return l;
}

function prevShopLevel(level) {
  let l = level - 1;
  while (l > 0 && !SHOP_ENDINGS.has(l % 10)) l--;
  return Math.max(0, l);
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
  if (upgrade.name === "Grace Wings" && state.difficulty === "Casual") {
    return 1;
  }
  if (upgrade.name === "Orb" && state.difficulty === "Casual") {
    return 1;
  }
  return 0;
}

function isCompatible(upgrade, lobby, difficulty) {
  if (upgrade.name === "Orb") return difficulty === "Casual";
  if (difficulty === "Casual" && TRIPMINE_RELATED.has(upgrade.name))
    return false;
  const soloOrDuo = lobby === "Solo" || lobby === "Duo";
  if (soloOrDuo && upgrade.name === "Last Robloxian Standing") return false;
  if (lobby === "Solo" && upgrade.name === "Radar Module: Players") return false;
  if (!soloOrDuo && upgrade.name === "Adrenaline") return false;
  return true;
}

function requiresMet(upgrade) {
  if (!Array.isArray(upgrade.requires)) return true;
  for (const dep of upgrade.requires) {
    const depName = typeof dep === "string" ? dep : dep.name;
    const need = typeof dep === "string" ? 1 : dep.count || 1;
    if ((state.obtained[depName] || 0) < need) return false;
  }
  return true;
}

function ownedCount(upgrade, lobby) {
  return freeStacks(upgrade, lobby) + (state.obtained[upgrade.name] || 0);
}

function isAvailable(upgrade, lobby) {
  return (
    isCompatible(upgrade, lobby, state.difficulty) &&
    requiresMet(upgrade) &&
    shopsFromLevel(upgrade.level, state.level) > 0
  );
}

function sortedUpgrades() {
  return [...state.upgrades].sort(
    (a, b) =>
      a.level - b.level ||
      a.base_price - b.base_price ||
      a.name.localeCompare(b.name),
  );
}

function selectionCost() {
  const lobby = lobbyType(state.cap);
  let total = 0;
  for (const u of state.upgrades) {
    if (!state.selected.has(u.name)) continue;
    if (!isAvailable(u, lobby)) continue;
    const idx = ownedCount(u, lobby) + 1;
    const base = effectiveBase(u, lobby, idx, state.difficulty);
    total += scaledPrice(base, state.players, lobby, state.difficulty);
  }
  return total;
}

function toggleSelect(name) {
  if (state.selected.has(name)) state.selected.delete(name);
  else state.selected.add(name);
}

function cycleObtained(upgrade, lobby) {
  const cap = maxStack(upgrade) - freeStacks(upgrade, lobby);
  let c = (state.obtained[upgrade.name] || 0) + 1;
  if (c > cap) c = 0;
  if (c <= 0) delete state.obtained[upgrade.name];
  else state.obtained[upgrade.name] = c;
}

function buySelected() {
  for (const name of state.selected) {
    state.obtained[name] = (state.obtained[name] || 0) + 1;
  }
  state.selected.clear();
}

function clearSelected() {
  state.selected.clear();
}

function clearObtained() {
  state.obtained = {};
}

const WIKI_IMG_BASE = "https://static.wikitide.net/nullscapewiki/";
const imgCache = {};

function getImg(path, alt, slot) {
  const key = `${slot}|${path}`;
  let img = imgCache[key];
  if (!img) {
    img = document.createElement("img");
    img.src = WIKI_IMG_BASE + path;
    img.alt = alt;
    imgCache[key] = img;
  }
  return img;
}

let tooltipEl = null;

function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(text, anchor) {
  const tip = getTooltip();
  const sep = text.indexOf("\n\n");
  const name = sep >= 0 ? text.slice(0, sep) : text;
  const desc = sep >= 0 ? text.slice(sep + 2).trim() : "";

  tip.innerHTML = "";
  const nameEl = document.createElement("div");
  nameEl.className = "tip-name";
  nameEl.textContent = name;
  tip.appendChild(nameEl);
  if (desc) {
    const descEl = document.createElement("div");
    descEl.className = "tip-desc";
    descEl.textContent = desc;
    tip.appendChild(descEl);
  }
  tip.style.display = "block";

  const a = anchor.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let top = a.top - t.height - 8;
  if (top < 4) top = a.bottom + 8;
  tip.style.left = `${a.left + a.width / 2}px`;
  tip.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = "none";
}

function buildTile(row, opts) {
  const tile = document.createElement("div");
  tile.className = "tile";
  if (opts.stateClass) tile.classList.add(opts.stateClass);
  tile.addEventListener("mouseenter", () => showTooltip(opts.title, tile));
  tile.addEventListener("mouseleave", hideTooltip);

  if (opts.slot === "obtained") {
    const lvl = document.createElement("span");
    lvl.className = "level-badge";
    lvl.textContent = `Level ${row.level}`;
    tile.appendChild(lvl);
  }

  if (row.upgrade.image) {
    tile.appendChild(getImg(row.upgrade.image, row.name, opts.slot));
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.textContent = row.name;
    tile.appendChild(ph);
  }

  if (opts.badge) {
    const badge = document.createElement("span");
    badge.className = "stack-badge";
    badge.textContent = opts.badge;
    tile.appendChild(badge);
  }

  if (opts.price !== undefined && opts.price !== null) {
    const priceLabel = document.createElement("span");
    priceLabel.className = "price";
    priceLabel.textContent = opts.price;
    tile.appendChild(priceLabel);
  }

  if (opts.onClick) tile.addEventListener("click", opts.onClick);
  return tile;
}

function renderObtained(lobby) {
  const grid = $("obtained");
  grid.innerHTML = "";

  for (const upgrade of sortedUpgrades()) {
    if (!isCompatible(upgrade, lobby, state.difficulty)) continue;
    const owned = ownedCount(upgrade, lobby);
    if (owned <= 0 && !state.showAll) continue;

    const max = maxStack(upgrade);
    const stacked = max > 1;
    const cap = max - freeStacks(upgrade, lobby);
    const row = {
      upgrade,
      name: upgrade.name,
      level: upgrade.level,
      maxStack: max,
    };

    grid.appendChild(
      buildTile(row, {
        slot: "obtained",
        stateClass: owned > 0 ? "locked" : "unavailable",
        badge: stacked ? `${owned}/${max}` : null,
        title: `${upgrade.name}\n\n${upgrade.description || ""}`,
        onClick:
          cap > 0
            ? () => {
                cycleObtained(upgrade, lobby);
                render();
              }
            : null,
      }),
    );
  }
}

function renderShop(lobby, remaining) {
  const grid = $("shop");
  grid.innerHTML = "";

  if (!SHOP_ENDINGS.has(state.level % 10)) return;

  for (const upgrade of sortedUpgrades()) {
    const max = maxStack(upgrade);
    const owned = ownedCount(upgrade, lobby);
    if (owned >= max) continue;
    if (!isAvailable(upgrade, lobby)) continue;

    const idx = owned + 1;
    const base = effectiveBase(upgrade, lobby, idx, state.difficulty);
    const price = scaledPrice(base, state.players, lobby, state.difficulty);
    const selected = state.selected.has(upgrade.name);
    const unaffordable = !selected && price > remaining;
    const row = {
      upgrade,
      name: upgrade.name,
      level: upgrade.level,
      maxStack: max,
    };

    grid.appendChild(
      buildTile(row, {
        slot: "shop",
        stateClass: selected ? "pending" : unaffordable ? "unaffordable" : null,
        price,
        title: `${upgrade.name}\n\n${upgrade.description || ""}`,
        onClick: () => {
          toggleSelect(upgrade.name);
          render();
        },
      }),
    );
  }
}

function render() {
  const lobby = lobbyType(state.cap);
  hideTooltip();

  const cost = selectionCost();
  const remaining = state.money - cost;
  const budgetEl = $("budget");
  budgetEl.textContent = `Remaining: ${remaining}`;
  budgetEl.classList.toggle("over", remaining < 0);
  $("cost").textContent = `Cost: ${cost}`;

  renderObtained(lobby);
  renderShop(lobby, remaining);
}

function bindInputs() {
  let levelTyped = false;
  $("level").addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setLevel(
        e.key === "ArrowUp"
          ? nextShopLevel(state.level)
          : prevShopLevel(state.level),
      );
      return;
    }
    levelTyped = true;
    setTimeout(() => {
      levelTyped = false;
    }, 0);
  });
  $("level").addEventListener("input", (e) => {
    const raw = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
    if (levelTyped) {
      state.level = raw;
      render();
      return;
    }
    setLevel(
      raw > state.level
        ? nextShopLevel(state.level)
        : prevShopLevel(state.level),
    );
  });
  $("levelMinus").addEventListener("click", () =>
    setLevel(prevShopLevel(state.level)),
  );
  $("levelPlus").addEventListener("click", () =>
    setLevel(nextShopLevel(state.level)),
  );
  $("money").addEventListener("input", (e) => {
    state.money = Math.max(0, parseInt(e.target.value || "0", 10));
    render();
  });
  $("cap").addEventListener("input", (e) => {
    setCap(parseInt(e.target.value || "1", 10));
  });
  $("capMinus").addEventListener("click", () => setCap(state.cap - 1));
  $("capPlus").addEventListener("click", () => setCap(state.cap + 1));
  $("players").addEventListener("input", (e) => {
    setPlayers(parseInt(e.target.value || "1", 10));
  });
  $("playersMinus").addEventListener("click", () =>
    setPlayers(state.players - 1),
  );
  $("playersPlus").addEventListener("click", () =>
    setPlayers(state.players + 1),
  );
  for (const opt of document.querySelectorAll(".diff-option")) {
    opt.addEventListener("click", () => {
      state.difficulty = opt.dataset.value;
      updateDiffSelection();
      render();
    });
  }
  $("showAll").addEventListener("change", (e) => {
    state.showAll = e.target.checked;
    render();
  });
  $("nothing").addEventListener("change", (e) => {
    state.nothing = e.target.checked;
    render();
  });
  $("autoAdvance").addEventListener("change", (e) => {
    state.autoAdvance = e.target.checked;
    localStorage.setItem("autoAdvance", state.autoAdvance);
  });
  $("lock").addEventListener("click", () => {
    buySelected();
    if (state.autoAdvance) setLevel(nextShopLevel(state.level));
    render();
  });
  $("clear").addEventListener("click", () => {
    clearSelected();
    render();
  });
  $("clearObtained").addEventListener("click", () => {
    clearObtained();
    render();
  });
  $("meow").addEventListener("click", () => {
    const meow = new Audio("meow.mp3");
    meow.volume = 0.5;
    meow.play();
  });
}

function setCap(v) {
  state.cap = Math.max(1, Math.min(20, v || 1));
  $("cap").value = state.cap;
  $("players").max = state.cap;
  if (state.players > state.cap) {
    state.players = state.cap;
    $("players").value = state.players;
  }
  updateCapReadout();
  updatePlayersReadout();
  render();
}

function setPlayers(v) {
  state.players = Math.max(1, Math.min(state.cap, v || 1));
  $("players").value = state.players;
  updatePlayersReadout();
  render();
}

function setLevel(v) {
  state.level = Math.max(0, v);
  $("level").value = state.level;
  render();
}

function sliderReadout(id, value, min, max, suffix = "") {
  const pct = max > min ? (value - min) / (max - min) : 0;
  const el = $(id);
  el.textContent = suffix ? `${value} ${suffix}` : value;
  el.style.left = `calc(${pct} * (100% - 20px) + 10px)`;
}

function updateCapReadout() {
  sliderReadout("capValue", state.cap, 1, 20, `(${lobbyType(state.cap)})`);
}

function updatePlayersReadout() {
  sliderReadout("playersValue", state.players, 1, state.cap);
}

function updateDiffSelection() {
  for (const opt of document.querySelectorAll(".diff-option")) {
    opt.classList.toggle("selected", opt.dataset.value === state.difficulty);
  }
}

function resetForm() {
  $("level").value = state.level;
  $("money").value = state.money;
  $("cap").value = state.cap;
  $("players").max = state.cap;
  $("players").value = state.players;
  $("showAll").checked = state.showAll;
  $("nothing").checked = state.nothing;
  $("autoAdvance").checked = state.autoAdvance;
  updateCapReadout();
  updatePlayersReadout();
  updateDiffSelection();
}

function cleanWikiText(s) {
  return s
    .replace(/\{\{[Hh]ighlight\|[^|]*\|([^}]*)\}\}/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikiDescriptions() {
  try {
    const url =
      "https://nullscape.wiki/w/api.php?action=parse&page=Upgrades" +
      "&prop=text&formatversion=2&format=json&origin=*";
    const res = await fetch(url);
    const data = await res.json();
    const doc = new DOMParser().parseFromString(data.parse.text, "text/html");

    let changed = false;
    const byName = {};
    for (const u of state.upgrades) byName[u.name] = u;

    for (const el of doc.querySelectorAll(".hoverInfo[data-title]")) {
      const u = byName[el.dataset.title];
      if (!u) continue;
      const desc = cleanWikiText(el.dataset.desc || "");
      if (desc && desc !== u.description) {
        u.description = desc;
        changed = true;
      }
    }
    if (changed) render();
  } catch (e) {
  }
}

function applyWikiPrice(upgrade, price) {
  if (price === undefined || price === null) return;
  if (typeof price === "number") {
    upgrade.base_price = Math.max(0, price);
    return;
  }
  if (typeof price !== "object") return;
  if (typeof price.normal === "number") upgrade.base_price = price.normal;
  if (typeof price.solo === "number") upgrade.solo_base_price = price.solo;
  if (typeof price.casual === "number") upgrade.casual_base_price = price.casual;
  if (Array.isArray(price.stack)) upgrade.stack_prices = price.stack;
  if (Array.isArray(price["stack-solo"]))
    upgrade.solo_stack_prices = price["stack-solo"];
  if (Array.isArray(price["stack-casual"]))
    upgrade.casual_stack_prices = price["stack-casual"];
}

async function fetchWikiPrices() {
  try {
    const url =
      "https://nullscape.wiki/w/api.php?action=query&format=json" +
      "&formatversion=2&prop=revisions&rvprop=content&rvslots=main" +
      "&titles=Module:GameData/Upgrades.json&origin=*";
    const res = await fetch(url);
    const data = await res.json();
    const content = data.query.pages[0].revisions[0].slots.main.content;
    const wiki = JSON.parse(content);

    const byName = {};
    for (const entry of Object.values(wiki)) byName[entry.name] = entry;

    for (const upgrade of state.upgrades) {
      const entry = byName[upgrade.name];
      if (entry) applyWikiPrice(upgrade, entry.price);
    }
    render();
  } catch (e) {
  }
}

async function init() {
  const res = await fetch("upgrades.json");
  const data = await res.json();

  state.upgrades = [
    ...data.in_game.map((u) => ({ ...u, category: "in_game" })),
    ...data.exclusive.map((u) => ({ ...u, category: "exclusive" })),
  ].filter((u) => !HIDDEN_UPGRADES.has(u.name));
  const stored = localStorage.getItem("autoAdvance");
  if (stored !== null) state.autoAdvance = stored === "true";
  resetForm();
  bindInputs();
  render();
  fetchWikiPrices();
  fetchWikiDescriptions();
}

init();
