import { haversine } from '../utils/physics';

export function* dijkstraOnGraph(nodes, edges, startId, endId) {
  const distances = { [startId]: 0 };
  const previous = {};
  const visited = new Set();
  const visitedEdges = [];
  const pq = [[0, startId]];
  
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [dist, currentId] = pq.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    if (currentId === endId) {
      const path = [];
      let curr = endId;
      while (curr) {
        const node = nodes[curr];
        path.unshift([node.lat, node.lon]);
        curr = previous[curr];
      }
      yield { type: 'found', path, visitedEdges, totalDistance: dist };
      return;
    }
    
    const neighbors = edges[currentId] || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      const current = nodes[currentId], neighbor = nodes[neighborId];
      const weight = haversine(current.lat, current.lon, neighbor.lat, neighbor.lon);
      const newDist = dist + weight;
      if (distances[neighborId] === undefined || newDist < distances[neighborId]) {
        distances[neighborId] = newDist;
        previous[neighborId] = currentId;
        pq.push([newDist, neighborId]);
        visitedEdges.push([[current.lat, current.lon], [neighbor.lat, neighbor.lon]]);
        yield { type: 'visiting', visitedEdges: [...visitedEdges], currentDistance: newDist };
      }
    }
  }
  yield { type: 'not_found' };
}

export function* astarOnGraph(nodes, edges, startId, endId) {
  const heuristic = (id) => haversine(nodes[id].lat, nodes[id].lon, nodes[endId].lat, nodes[endId].lon);
  const gScore = { [startId]: 0 };
  const fScore = { [startId]: heuristic(startId) };
  const previous = {};
  const visited = new Set();
  const visitedEdges = [];
  const openSet = new Set([startId]);

  while (openSet.size > 0) {
    let currentId = null, minF = Infinity;
    for (const id of openSet) {
      if (fScore[id] < minF) { minF = fScore[id]; currentId = id; }
    }
    
    if (currentId === endId) {
      const path = [];
      let curr = endId;
      while (curr) { path.unshift([nodes[curr].lat, nodes[curr].lon]); curr = previous[curr]; }
      yield { type: 'found', path, visitedEdges, totalDistance: gScore[endId] };
      return;
    }

    openSet.delete(currentId);
    visited.add(currentId);

    const neighbors = edges[currentId] || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      const weight = haversine(nodes[currentId].lat, nodes[currentId].lon, nodes[neighborId].lat, nodes[neighborId].lon);
      const tentativeG = gScore[currentId] + weight;
      if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
        previous[neighborId] = currentId;
        gScore[neighborId] = tentativeG;
        fScore[neighborId] = tentativeG + (heuristic(neighborId) * 1.2);
        openSet.add(neighborId);
        visitedEdges.push([[nodes[currentId].lat, nodes[currentId].lon], [nodes[neighborId].lat, nodes[neighborId].lon]]);
        yield { type: 'visiting', visitedEdges: [...visitedEdges], currentDistance: tentativeG };
      }
    }
  }
  yield { type: 'not_found' };
}
