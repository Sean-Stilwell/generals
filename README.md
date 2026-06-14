# Generals

A strategic turn-based multiplayer game where players compete to capture enemy generals and dominate the map.

## Overview

Generals is a browser-based strategy game inspired by classic territorial conquest games. Players control armies across a grid-based map, manage troops from their generals and cities, and battle opponents in real-time gameplay. The first player to capture all enemy generals wins!

This project is built using vanilla HTML5 Canvas for rendering, JavaScript for game logic, and CSS for styling.

## Game Features

- **Multiplayer Gameplay**: Supports 2-8 players in free-for-all matches
- **Strategic Map**: 18×22 grid with varied terrain including plains, mountains, cities, and generals
- **Fog of War**: Unrevealed terrain keeps the game exciting and strategic
- **Troop Management**: 
  - Generals (★) produce troops every turn
  - Cities (🏙) produce troops every 2 turns
  - Move troops between adjacent cells to attack or defend
- **Real-time Turns**: Automatic turn progression with adjustable speed
- **Live Leaderboard**: Track land and army counts for all players

## How to Play

1. **Start a Game**: Click the "Start Game" button and select the number of players
2. **Select and Move**: 
   - Click a cell you control to select it
   - Click an adjacent cell to move troops from the selected cell to the target
   - Troops attempt to capture enemy-controlled cells
3. **Win Condition**: Capture all enemy generals to win the match
4. **Adjust Settings**: Use the player count selector to customize game size before starting

## Game Mechanics

- **Troop Movement**: Each move transfers armies from one cell to an adjacent cell
- **Fog of War**: Only your controlled territory and recently visible areas are revealed
- **Cell Types**:
  - **Plains**: Open terrain that can be controlled and hold armies
  - **Mountains**: Impassable terrain that blocks movement
  - **Cities**: Special locations that produce extra troops
  - **Generals**: Your starting position; capturing an enemy general eliminates that player

## Project Structure

```
generals/
├── index.html      # Main HTML file and game UI
├── gameplay.js     # Game logic, rendering, and mechanics
├── styles.css      # Styling for UI and canvas
└── README.md       # This file
```

## Getting Started

1. Open `index.html` in a modern web browser
2. Select the number of players (2-8)
3. Click "Start Game" to begin
4. Play using your mouse to select and move troops

No installation or dependencies required!

## Browser Compatibility

Works on all modern browsers that support HTML5 Canvas