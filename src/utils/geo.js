export const findNearestNode = (nodes, lat, lng) => {
  let nearest = null, minDist = Infinity;
  for (const [id, node] of Object.entries(nodes)) {
    const dist = Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lng, 2);
    if (dist < minDist) { minDist = dist; nearest = Number(id); }
  }
  return nearest;
};

export const findNearestNodeCoords = (nodes, lat, lng) => {
  let nearestCoords = null, nearestId = null, minDist = Infinity;
  for (const [id, node] of Object.entries(nodes)) {
    const dist = Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lng, 2);
    if (dist < minDist) { 
      minDist = dist; 
      nearestId = id;
      nearestCoords = { lat: node.lat, lng: node.lon }; 
    }
  }
  return minDist > 0.0003 ? null : { ...nearestCoords, id: nearestId };
};
