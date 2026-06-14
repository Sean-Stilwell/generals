// Initialize constants and global variables
const ROWS = 18;
const COLS = 22;
const CELL = 32; // Pixel size of each cell
const PLAINS = 0; // Open cell type, can be owned and have armies
const MOUNTAIN = -1; // Impassable cell type, cannot be owned or have armies
const CITY = -2; // Special cell type, can be owned and have armies, provides extra troops each turn
const NUM_PLAYERS = 4; // Set to 2-8 for variable player count

const PLAYER_COLORS = [
  { color: "#4A90D9", dark: "#2563a8", name: "You" },
  { color: "#E05252", dark: "#b33232", name: "Red" },
  { color: "#5BAD6F", dark: "#3d8a50", name: "Green" },
  { color: "#E8A838", dark: "#b87c18", name: "Orange" },
  { color: "#9B59B6", dark: "#6C3483", name: "Purple" },
  { color: "#1ABC9C", dark: "#0D7377", name: "Cyan" },
  { color: "#E91E63", dark: "#AD1457", name: "Pink" },
  { color: "#F1C40F", dark: "#B8960F", name: "Yellow" },
];

let PLAYERS = []; // Populated dynamically based on NUM_PLAYERS

let grid, owners, armies, revealed, generals, cities; // 2D arrays for cell types, ownership, army counts, fog of war, plus general and city locations
let selected = null; // Currently selected cell for issuing orders (row, col)
let turn = 0; // Current turn number (starting at 0, increments each tick, reset on new game)
let gameActive = false;
let gameOver = false;
let eliminated = [];
let pendingMoves = []; // [{sr,sc,fr,fc,tr,tc}] queued by player, executed one per tick
let tickInterval = null;
let tickSpeed = 300;

const canvas = document.getElementById("gc");
const ctx = canvas.getContext("2d");

/**
 * Generates the specified number of players for the game.
 * @param {*} count - the number of players to generate
 */
function generatePlayers(count) {
  PLAYERS = [];
  const validCount = Math.max(2, Math.min(count, PLAYER_COLORS.length));
  for (let i = 0; i < validCount; i++) {
    PLAYERS.push({
      id: i + 1,
      ...PLAYER_COLORS[i],
    });
  }
}

// Animate the tick progress bar (for demonstration purposes, can be removed if not needed)
const bar = document.getElementById("tick-bar");

/**
 * Animates the tick progress bar by resetting its width and then transitioning it to full width over the specified duration.
 * @param {*} ms - duration of the animation in milliseconds
 */
function animateBar(ms) {
  bar.style.transition = "none";
  bar.style.width = "0%";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = "100%";
    }),
  );
}

/**
 * Initializes the game state, including generating players, creating the grid, placing mountains and cities,
 * and setting up player spawn points.
 */
function initGame() {
  generatePlayers(NUM_PLAYERS);

  // Initialize grid and related arrays as 2D arrays filled with default values
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(PLAINS));
  owners = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  armies = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  generals = {};
  cities = [];
  eliminated = [];
  gameOver = false;
  selected = null;
  pendingMoves = [];

  // Place mountains on the board
  let mountainTarget = Math.floor(ROWS * COLS * 0.08); // Target number of mountains (8% of the grid)
  let placedMountains = 0;
  for (let i = 0; i < mountainTarget * 4; i++) {
    let row = 1 + Math.floor(Math.random() * (ROWS - 2));
    let col = 1 + Math.floor(Math.random() * (COLS - 2));
    if (grid[row][col] === PLAINS) {
      grid[row][col] = MOUNTAIN;
      placedMountains++;
    }
    if (placedMountains >= mountainTarget) {
      break;
    }
  }

  // Place cities on the board
  let cityTarget = Math.floor(ROWS * COLS * 0.04);
  let placedCities = 0;
  for (let i = 0; i < cityTarget * 4 && cities.length < cityTarget; i++) {
    let row = 1 + Math.floor(Math.random() * (ROWS - 2)),
      col = 1 + Math.floor(Math.random() * (COLS - 2));
    if (grid[row][col] === PLAINS) {
      grid[row][col] = CITY;
      armies[row][col] = 40 + Math.floor(Math.random() * 10); // Cities start with 40-50 troops
      cities.push([row, col]);
      placedCities++;
    }
    if (placedCities >= cityTarget) {
      break;
    }
  }

  // Generate random spawn positions with minimum distance
  let spawnPositions = [];
  let attempts = 0;
  const minDistance = PLAYERS.length > 6 ? 4 : 6; // Reduce distance for more players
  const maxAttempts = PLAYERS.length > 6 ? 1000 : 500;

  while (spawnPositions.length < PLAYERS.length && attempts < maxAttempts) {
    let r = 2 + Math.floor(Math.random() * (ROWS - 4));
    let c = 2 + Math.floor(Math.random() * (COLS - 4));

    // Check if far enough from other spawns
    let tooClose = spawnPositions.some(
      ([sr, sc]) => Math.abs(r - sr) + Math.abs(c - sc) < minDistance,
    );

    if (!tooClose && grid[r][c] === PLAINS) {
      spawnPositions.push([r, c]);
    }
    attempts++;
  }

  // Place players at spawn positions
  PLAYERS.forEach((p, i) => {
    if (i >= spawnPositions.length) return;
    let [row, col] = spawnPositions[i];
    // Clear 3x3 area around spawn
    // for (let dr = -1; dr <= 1; dr++)
    //   for (let dc = -1; dc <= 1; dc++) {
    //     let nr = row + dr,
    //       nc = col + dc;
    //     if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
    //       grid[nr][nc] = PLAINS;
    //       owners[nr][nc] = 0;
    //       armies[nr][nc] = 0;
    //     }
    //   }
    owners[row][col] = p.id;
    armies[row][col] = 1;
    generals[p.id] = { r: row, c: col };
  });

  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  updateFog();
  render();
  updateHUD();
}

/**
 * Updates the revealed cells based on player ownership. A cell is revealed if it's owned by the player
 * or adjacent to a cell owned by the player.
 */
function updateFog() {
  // Reset all cells to unrevealed by default
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) revealed[r][c] = false;

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      // If cell is owned by player, reveal it and adjacent cells
      if (owners[r][c] === 1)
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            let nr = r + dr,
              nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
              revealed[nr][nc] = true;
          }
    }
}

/**
 * Adds a city to the grid at the specified position.
 * @param {*} r - row
 * @param {*} c - column
 */
function addCity(r, c) {
  if (grid[r][c] !== CITY) grid[r][c] = CITY;
  if (!cities.some(([cr, cc]) => cr === r && cc === c)) cities.push([r, c]);
}

/**
 * Renders the game state onto the canvas, including cells, armies, generals, cities, and selection highlights.
 */
function render() {
  ctx.fillStyle = "#e8e4dc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Initialize variables for rendering the cell based on its state
      let x = c * CELL;
      let y = r * CELL;
      let visible = revealed[r][c];
      let owner = owners[r][c]; //
      let isMountain = grid[r][c] === MOUNTAIN;
      let  isCity = grid[r][c] === CITY;
      let army = armies[r][c];
      let sel = selected && selected[0] === r && selected[1] === c;
      let isGeneral = Object.values(generals).some((g) => g.r === r && g.c === c);
      let isPending = pendingMoves.some(
        (m) => (m.fr === r && m.fc === c) || (m.tr === r && m.tc === c),
      );
      let isPendingDest = pendingMoves.some((m) => m.tr === r && m.tc === c);

      // Determine cell color based on its type, ownership, and visibility
      if (!visible) // Fog of war: show mountains and cities as darker, others as light gray
        ctx.fillStyle = isMountain || isCity ? "#a09a8c" : "#c5c0b0";
      else if (isMountain) ctx.fillStyle = "#666";
      else if (owner === 0) ctx.fillStyle = isCity ? "#9b9488" : "#e8e4dc"; // owner === 0 means unowned, show cities as slightly darker
      else ctx.fillStyle = PLAYERS[owner - 1].color;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

      if (sel) { // Highlight selected cell with a bright border
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }
      if (isPendingDest && !sel) { // Highlight pending move destinations with a semi-transparent border
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }

      if (visible && isGeneral && owner > 0) { // Draw general as a star with army count below
        ctx.font = "bold " + CELL * 0.4 + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = owner === 1 ? "#fff" : PLAYERS[owner - 1].dark;
        ctx.fillText("★", x + CELL / 2, y + CELL / 2);
        if (army > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.font = "8px sans-serif";
          ctx.fillText(army, x + CELL / 2, y + CELL - 7);
        }
      } else if (visible && isCity) { // Draw city as a building icon with army count below
        ctx.font = CELL * 0.4 + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = owner > 0 ? "#fff" : "#555";
        ctx.fillText("🏙", x + CELL / 2, y + CELL / 2);
        if (army > 0) {
          ctx.fillStyle = owner > 0 ? "#fff" : "#555";
          ctx.font = "8px sans-serif";
          ctx.fillText(army, x + CELL / 2, y + CELL - 7);
        }
      } else if (visible && !isMountain && army > 0) { // Draw army count for regular cells
        ctx.fillStyle = owner > 0 ? "#fff" : "#555";
        ctx.font = (army > 99 ? "8" : "11") + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(army, x + CELL / 2, y + CELL / 2);
      }

      ctx.strokeStyle = "#bab5aa";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }
}

/**
 * Applies a move for the specified player
 * @param {*} pid - player ID
 * @param {*} fr - from row
 * @param {*} fc - from column
 * @param {*} tr - to row
 * @param {*} tc - to column
 * @returns
 */
function applyMove(pid, fr, fc, tr, tc) {
  let amount = armies[fr][fc] - 1;
  if (amount < 1) return;
  armies[fr][fc] -= amount;
  if (owners[tr][tc] === pid) // reinforce
  {
    armies[tr][tc] += amount;
  } else // attack
  {
    if (amount > armies[tr][tc]) {
      let rem = amount - armies[tr][tc];
      // Check if a general is killed and transfer ownership of their cells to the attacker
      let killedPid = Object.keys(generals).find(
        (k) => generals[k].r === tr && generals[k].c === tc,
      );
      if (killedPid) {
        killedPid = parseInt(killedPid);
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (owners[r][c] === killedPid) {
              owners[r][c] = pid;
              armies[r][c] = Math.ceil(armies[r][c] / 2);
            }
        delete generals[killedPid];
        addCity(tr, tc); // Convert killed general's cell into a city for the attacker
        eliminated.push(killedPid);
        if (killedPid === 1) showGameOver(false); // Player's general killed, game over
      }
      owners[tr][tc] = pid;
      armies[tr][tc] = rem;
    } else {
      armies[tr][tc] -= amount;
    }
  }
}

/**
 * Executes an AI move for the specified player
 * @param {*} pid - player ID
 * @returns 
 */
function aiMove(pid) {
  let best = null;
  let bestVal = -1;

  // Simple AI: find the owned cell with the largest army and try to attack from there
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (owners[r][c] === pid && armies[r][c] > 1 && armies[r][c] > bestVal) {
        bestVal = armies[r][c];
        best = [r, c];
      }
  if (!best) return; // No valid moves
  let [r, c] = best;
  let dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  dirs.sort(() => Math.random() - 0.5);
  let g1 = generals[1]; // Bias moves towards it
  if (g1 && Math.random() < 0.55)
    dirs.sort(
      (a, b) =>
        Math.abs(r + a[0] - g1.r) +
        Math.abs(c + a[1] - g1.c) -
        (Math.abs(r + b[0] - g1.r) + Math.abs(c + b[1] - g1.c)),
    );
  for (let [dr, dc] of dirs) { // Try moves in random order (biased towards player general if known)
    let nr = r + dr,
      nc = c + dc;
    if (
      nr < 0 ||
      nr >= ROWS ||
      nc < 0 ||
      nc >= COLS ||
      grid[nr][nc] === MOUNTAIN
    )
      continue;
    applyMove(pid, r, c, nr, nc);
    return;
  }
}

/**
 * Processes one turn of the game, including executing one queued player move, spawning troops, executing AI moves, updating fog of war, rendering the game state, updating the HUD, and checking for win conditions.
 * @returns {void}
 */
function tickTurn() {
  if (!gameActive || gameOver) return;
  turn++;

  // Execute one queued player move per tick
  while (pendingMoves.length) {
    let { fr, fc, tr, tc } = pendingMoves[0];
    if (!(owners[fr][fc] === 1 && armies[fr][fc] > 1)) {
      pendingMoves.shift();
      continue;
    }
    pendingMoves.shift();
    applyMove(1, fr, fc, tr, tc);
    if (pendingMoves.length) {
      let next = pendingMoves[pendingMoves.length - 1];
      selected = [next.tr, next.tc];
    } else if (owners[tr][tc] === 1 && armies[tr][tc] > 1) {
      selected = [tr, tc];
    } else {
      selected = null;
    }
    break;
  }

  // Spawn troops for each player based on owned cells, with extra for cities.
  for (let p of PLAYERS) {
    if (eliminated.includes(p.id)) continue;
    let g = generals[p.id];
    if (g) armies[g.r][g.c]++; // Generals spawn 1 troop per turn
    for (let r = 0; r < ROWS; r++) // Each owned city spawns 1 troop per turn
      for (let c = 0; c < COLS; c++)
        if (owners[r][c] === p.id && grid[r][c] === CITY) armies[r][c]++;
    if (turn % 25 === 0) // Every 25 turns, all owned cells spawn 1 troop
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (owners[r][c] === p.id && grid[r][c] === 0) armies[r][c]++;
  }

  // AI moves
  for (let p of PLAYERS)
    if (p.id !== 1 && !eliminated.includes(p.id)) aiMove(p.id);

  updateFog();
  render();
  updateHUD();
  checkWin();
}

/**
 * Checks if the game has been won or lost
 * @returns {void}
 */
function checkWin() {
  if (eliminated.includes(1)) {
    showGameOver(false);
    return;
  }
  let alive = PLAYERS.filter((p) => generals[p.id]);
  if (alive.length === 1 && alive[0].id === 1) showGameOver(true);
}

/**
 * Displays the game over screen with the appropriate message based on whether the player won or lost.
 * @param {boolean} won - Indicates if the player won the game.
 * @returns {void}
 */
function showGameOver(won) {
  gameOver = true;
  gameActive = false;
  clearInterval(tickInterval);
  let box = document.getElementById("overlay-box");
  box.innerHTML = `<h2 style="color:${won ? "#5BAD6F" : "#E05252"}">${won ? "Victory!" : "Defeated"}</h2>
    <p>${won ? "All enemy generals captured!" : "Your general was captured."} Survived ${turn} turns.</p>
    <button onclick="startGame()">Play Again</button>`;
  document.getElementById("overlay").style.display = "flex";
}

/**
 * Calculates and returns statistics for each player, including land owned, army size, and general status.
 * @returns {Array} An array of player statistics objects.
 */
function getPlayerStats() {
  const stats = {};
  PLAYERS.forEach((p) => {
    stats[p.id] = { land: 0, army: 0, name: p.name, color: p.color };
  });
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const owner = owners[r][c];
      if (owner > 0 && stats[owner]) {
        stats[owner].land++;
        stats[owner].army += armies[r][c];
      }
    }
  return Object.values(stats).sort((a, b) => b.land - a.land);
}

/**
 * Updates the leaderboard with the latest player statistics.
 * @returns {void}
 */
function updateLeaderboard() {
  const stats = getPlayerStats();
  const tbody = document.querySelector("#leaderboard tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  stats.forEach((s) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="display:flex; align-items:center; gap:6px">
        <div style="width:10px; height:10px; background:${s.color}; border-radius:2px;"></div>
        ${s.name}
      </td>
      <td>${s.land}</td>
      <td>${s.army}</td>
    `;
    tbody.appendChild(row);
  });
}

/**
 * Updates the heads-up display with the latest game information.
 * @returns {void}
 */
function updateHUD() {
  let army = 0,
    land = 0,
    citiesOwned = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (owners[r][c] === 1) {
        land++;
        army += armies[r][c];
        if (grid[r][c] === CITY) citiesOwned++;
      }
  document.getElementById("s-army").textContent = army;
  document.getElementById("s-land").textContent = land;
  document.getElementById("s-cities").textContent = citiesOwned;
  document.getElementById("s-gens").textContent = generals[1] ? 1 : 0;
  document.getElementById("turn-label").textContent = "Turn " + turn;
  updateLeaderboard();
}

/**
 * Sets the message displayed in the game. This is used to provide feedback to the player based on their actions.
 * Also useful for debugging or providing information about game events.
 * @param {string} t - The message to display.
 */
function setMsg(t) {
  document.getElementById("msg").textContent = t;
}

/**
 * Sets the speed of the game ticks.
 * @param {number} ms - The interval in milliseconds between ticks.
 */
function setSpeed(ms) {
  tickSpeed = ms;
  ["slow", "norm", "fast"].forEach(
    (id) => (document.getElementById("sp-" + id).style.fontWeight = "400"),
  );
  let active = ms === 2000 ? "slow" : ms === 1000 ? "norm" : "fast";
  document.getElementById("sp-" + active).style.fontWeight = "600";
  if (gameActive) {
    clearInterval(tickInterval);
    startTick();
  }
}

/**
 * Starts the game tick loop, which processes turns at regular intervals defined by tickSpeed. It also animates the tick progress bar for visual feedback.
 * @returns {void}
 */
function startTick() {
  animateBar(tickSpeed);
  tickInterval = setInterval(() => {
    tickTurn();
    animateBar(tickSpeed);
  }, tickSpeed);
}

// Handle interactions: clicking to select/move and keyboard for quick commands
canvas.addEventListener("click", (e) => {
  if (!gameActive || gameOver) return;
  let rect = canvas.getBoundingClientRect();
  let scaleX = canvas.width / rect.width,
    scaleY = canvas.height / rect.height;
  let c = Math.floor(((e.clientX - rect.left) * scaleX) / CELL);
  let r = Math.floor(((e.clientY - rect.top) * scaleY) / CELL);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

  if (!selected) { // No cell currently selected, try to select this one
    if (owners[r][c] === 1 && armies[r][c] > 1) {
      selected = [r, c];
      setMsg("Click adjacent cell to move (executes next tick)");
    } else setMsg("Select your cell with 2+ troops");
  } else { // Cell already selected, try to move or change selection
    if (selected[0] === r && selected[1] === c) {
      selected = null;
      pendingMoves = [];
      setMsg("Deselected");
      render();
      return;
    }
    let current = [selected[0], selected[1]];
    for (let i = pendingMoves.length - 1; i >= 0; i--) {
      let m = pendingMoves[i];
      if (m.sr === selected[0] && m.sc === selected[1]) {
        current = [m.tr, m.tc];
        break;
      }
    }
    if ( // Check if clicked cell is adjacent to current cell and not a mountain
      Math.abs(current[0] - r) + Math.abs(current[1] - c) === 1 &&
      grid[r][c] !== MOUNTAIN
    ) { // Valid move, queue it up
      pendingMoves.push({
        sr: selected[0],
        sc: selected[1],
        fr: current[0],
        fc: current[1],
        tr: r,
        tc: c,
      });
      selected = [r, c];
      setMsg("Move queued — executes on next tick");
    } else if (owners[r][c] === 1 && armies[r][c] > 1) { // Change selection to another owned cell with 2+ troops, preserving queued moves if still valid
      selected = [r, c];
      setMsg("Queued moves preserved; continue from new selection");
      render();
      return;
    } else { // Invalid move, show error message
      setMsg("Must be adjacent and not a mountain");
    }
  }
  render();
});

// Keyboard controls for quick selection and movement (WASD or arrow keys to move, Esc to deselect)
document.addEventListener("keydown", (e) => {
  if (!gameActive || gameOver) return;
  if (!selected) {
    let g = generals[1];
    if (g) {
      selected = [g.r, g.c];
      render();
    }
    return;
  }
  let [r, c] = selected,
    dr = 0,
    dc = 0;
  const key = e.key.toLowerCase();
  if (key === "arrowup" || key === "w") dr = -1;
  else if (key === "arrowdown" || key === "s") dr = 1;
  else if (key === "arrowleft" || key === "a") dc = -1;
  else if (key === "arrowright" || key === "d") dc = 1;
  else if (key === "escape") {
    selected = null;
    pendingMoves = [];
    render();
    return;
  } else return;
  e.preventDefault();
  let current = [selected[0], selected[1]];
  for (let i = pendingMoves.length - 1; i >= 0; i--) {
    let m = pendingMoves[i];
    if (m.sr === selected[0] && m.sc === selected[1]) {
      current = [m.tr, m.tc];
      break;
    }
  }
  let nr = current[0] + dr,
    nc = current[1] + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === MOUNTAIN)
    return;
  pendingMoves.push({
    sr: selected[0],
    sc: selected[1],
    fr: current[0],
    fc: current[1],
    tr: nr,
    tc: nc,
  });
  selected = [nr, nc];
  setMsg("Move queued — executes on next tick");
  render();
});

// ── start ────────────────────────────────────────────────────────
function startGame() {
  clearInterval(tickInterval);
  document.getElementById("overlay").style.display = "none";
  gameActive = true;
  turn = 0;
  initGame();
  updateLegend();
  setSpeed(tickSpeed);
}

function updateLegend() {
  const legend = document.querySelector(".legend");
  let html = "";
  PLAYERS.forEach((p) => {
    html += `<div class="leg"><div class="leg-sq" style="background:${p.color}"></div>${p.name}</div>`;
  });
  html +=
    '<div class="leg"><div class="leg-sq" style="background:#555"></div>Mountain</div>';
  html +=
    '<div class="leg"><div class="leg-sq" style="background:#c5c0b0"></div>Fog</div>';
  legend.innerHTML = html;
}

setSpeed(1000);
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;
ctx.fillStyle = "#e8e4dc";
ctx.fillRect(0, 0, canvas.width, canvas.height);
