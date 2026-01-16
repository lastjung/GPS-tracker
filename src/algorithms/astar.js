/**
 * A* Search Algorithm
 * - Combines Dijkstra with heuristic (estimated distance to goal)
 * - Much faster than Dijkstra when heuristic is good
 * - Uses Manhattan distance as heuristic
 */
function heuristic(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); // Manhattan distance
}

export function* astar(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0].length;
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  
  const gScore = {}; // Cost from start to node
  const fScore = {}; // gScore + heuristic
  const previous = {};
  const visited = new Set();
  const openSet = []; // priority queue: [fScore, row, col]
  
  const startKey = `${start[0]},${start[1]}`;
  gScore[startKey] = 0;
  fScore[startKey] = heuristic(start, end);
  openSet.push([fScore[startKey], start[0], start[1]]);
  
  while (openSet.length > 0) {
    // Sort to get minimum fScore
    openSet.sort((a, b) => a[0] - b[0]);
    const [f, row, col] = openSet.shift();
    const currentKey = `${row},${col}`;
    
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    
    // Yield current state for visualization
    yield {
      type: 'visiting',
      node: [row, col],
      visited: new Set(visited),
      frontier: openSet.map(([f, r, c]) => [r, c])
    };
    
    // Check if we reached the end
    if (row === end[0] && col === end[1]) {
      const path = [];
      let curr = currentKey;
      while (curr) {
        const [r, c] = curr.split(',').map(Number);
        path.unshift([r, c]);
        curr = previous[curr];
      }
      yield { type: 'found', path };
      return path;
    }
    
    // Explore neighbors
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      const neighborKey = `${newRow},${newCol}`;
      
      if (
        newRow >= 0 && newRow < rows &&
        newCol >= 0 && newCol < cols &&
        grid[newRow][newCol] !== 1 &&
        !visited.has(neighborKey)
      ) {
        const weight = grid[newRow][newCol] === 2 ? 5 : 1;
        const tentativeG = gScore[currentKey] + weight;
        
        if (gScore[neighborKey] === undefined || tentativeG < gScore[neighborKey]) {
          previous[neighborKey] = currentKey;
          gScore[neighborKey] = tentativeG;
          fScore[neighborKey] = tentativeG + heuristic([newRow, newCol], end);
          openSet.push([fScore[neighborKey], newRow, newCol]);
        }
      }
    }
  }
  
  yield { type: 'not_found' };
  return null;
}
