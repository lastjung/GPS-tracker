export function* bfs(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0].length;
  const queue = [[start[0], start[1]]];
  const visited = new Set();
  const previous = {};
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  
  const startKey = `${start[0]},${start[1]}`;
  visited.add(startKey);
  
  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const currentKey = `${row},${col}`;
    
    yield {
      type: 'visiting',
      node: [row, col],
      visited: new Set(visited),
      frontier: queue.map(([r, c]) => [r, c])
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
      
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== 1 && !visited.has(key)) {
        visited.add(key);
        previous[key] = currentKey;
        queue.push([nr, nc]);
      }
    }
  }
  
  yield { type: 'not_found' };
}
