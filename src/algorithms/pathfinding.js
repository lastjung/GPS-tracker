import { haversine } from '../utils/physics';

// Fast Binary Heap for Priority Queue
class PriorityQueue {
  constructor(comparator = (a, b) => a[0] - b[0]) {
    this.heap = [];
    this.comparator = comparator;
  }
  push(val) {
    this.heap.push(val);
    this.siftUp();
  }
  pop() {
    if (this.size() === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.size() > 0) {
      this.heap[0] = bottom;
      this.siftDown();
    }
    return top;
  }
  size() { return this.heap.length; }
  siftUp() {
    let node = this.size() - 1;
    while (node > 0) {
      const parent = (node - 1) >> 1;
      if (this.comparator(this.heap[node], this.heap[parent]) < 0) {
        [this.heap[node], this.heap[parent]] = [this.heap[parent], this.heap[node]];
        node = parent;
      } else break;
    }
  }
  siftDown() {
    let node = 0;
    while (true) {
      let smallest = node;
      const left = (node << 1) + 1;
      const right = (node << 1) + 2;
      if (left < this.size() && this.comparator(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < this.size() && this.comparator(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest !== node) {
        [this.heap[node], this.heap[smallest]] = [this.heap[smallest], this.heap[node]];
        node = smallest;
      } else break;
    }
  }
}

export function* dijkstraOnGraph(nodes, edges, startId, endId) {
  const distances = { [startId]: 0 };
  const previous = {};
  const visited = new Set();
  const visitedEdges = [];
  const pq = new PriorityQueue();
  pq.push([0, startId]);
  
  while (pq.size() > 0) {
    const [dist, currentId] = pq.pop();
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
        // Yield reference, not copy to avoid O(N^2). Include currentPos for auto-follow.
        yield { 
          type: 'visiting', 
          visitedEdges, 
          currentDistance: newDist, 
          currentPos: [neighbor.lat, neighbor.lon] 
        };
      }
    }
  }
  yield { type: 'not_found' };
}

export function* astarOnGraph(nodes, edges, startId, endId) {
  const heuristic = (id) => haversine(nodes[id].lat, nodes[id].lon, nodes[endId].lat, nodes[endId].lon);
  const gScore = { [startId]: 0 };
  const initialH = heuristic(startId);
  const fScore = { [startId]: initialH };
  const previous = {};
  const visited = new Set();
  const visitedEdges = [];
  const pq = new PriorityQueue();
  pq.push([initialH, startId]);

  while (pq.size() > 0) {
    const [f, currentId] = pq.pop();
    
    if (visited.has(currentId)) continue;
    
    if (currentId === endId) {
      const path = [];
      let curr = endId;
      while (curr) { path.unshift([nodes[curr].lat, nodes[curr].lon]); curr = previous[curr]; }
      yield { type: 'found', path, visitedEdges, totalDistance: gScore[endId] };
      return;
    }

    visited.add(currentId);

    const neighbors = edges[currentId] || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      
      const current = nodes[currentId];
      const neighbor = nodes[neighborId];
      const weight = haversine(current.lat, current.lon, neighbor.lat, neighbor.lon);
      const tentativeG = gScore[currentId] + weight;
      
      if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
        previous[neighborId] = currentId;
        gScore[neighborId] = tentativeG;
        
        // Standard A* (Weight 1.0) for fastest pathfinding
        const h = heuristic(neighborId);
        const fValue = tentativeG + h;
        fScore[neighborId] = fValue;
        
        pq.push([fValue, neighborId]);
        visitedEdges.push([[current.lat, current.lon], [neighbor.lat, neighbor.lon]]);
        // Optimization: Yield reference instead of spreading. Include currentPos for auto-follow.
        yield { 
          type: 'visiting', 
          visitedEdges, 
          currentDistance: tentativeG,
          currentPos: [neighbor.lat, neighbor.lon]
        };
      }
    }
  }
  yield { type: 'not_found' };
}
