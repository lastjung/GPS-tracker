export const findNearestNode = (nodes, lat, lng) => {
  let nearest = null, minDist = Infinity;
  // Fast raw loop for large datasets like LA (99MB+)
  for (const id in nodes) {
    const node = nodes[id];
    const dLat = node.lat - lat;
    const dLon = node.lon - lng;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < minDist) { 
      minDist = dist; 
      nearest = Number(id); 
    }
  }
  return nearest;
};

export const findNearestNodeCoords = (nodes, lat, lng) => {
  let nearestCoords = null, nearestId = null, minDist = Infinity;
  for (const id in nodes) {
    const node = nodes[id];
    const dLat = node.lat - lat;
    const dLon = node.lon - lng;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < minDist) { 
      minDist = dist; 
      nearestId = id;
      nearestCoords = { lat: node.lat, lng: node.lon }; 
    }
  }
  return minDist > 0.001 ? null : { ...nearestCoords, id: nearestId };
};
