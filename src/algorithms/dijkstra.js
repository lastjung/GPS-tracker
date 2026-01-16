export function* dijkstra(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0].length;
  const distances = {};
  const previous = {};
  const visited = new Set();
  const pq = [[0, start[0], start[1]]]; // [distance, row, col]
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  
  const startKey = `${start[0]},${start[1]}`;
  distances[startKey] = 0;
  
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [dist, row, col] = pq.shift();
    const currentKey = `${row},${col}`;
    
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    
    yield {
      type: 'visiting',
      node: [row, col],
      visited: new Set(visited),
      frontier: pq.map(([d, r, c]) => [r, c])
    };
    
    if (row === end[0] && col === end[1]) {
      const path = [];
      let curr = currentKey;
      while (curr) {
        const [r, c] = curr.split(',').map(Number);
        path.unshift([r, c]);
        curr = previous[curr];
      }
      yield { type: 'found', path };
      return;
    }
    
    for (const [dr, dc] of directions) {
      const nr = row + dr;
      const nc = col + dc;
      const key = `${nr},${nc}`;
      
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== 1) {
        const weight = grid[nr][nc] === 2 ? 5 : 1;
        const newDist = dist + weight;
        
        if (distances[key] === undefined || newDist < distances[key]) {
          distances[key] = newDist;
          previous[key] = currentKey;
          pq.push([newDist, nr, nc]);
        }
      }
    }
  }
  
  yield { type: 'not_found' };
}
