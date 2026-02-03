import { useState, useCallback, useRef } from 'react';

// Overpass API fetching logic
const fetchRoadNetwork = async (bounds, signal) => {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  const makeQuery = (b, timeoutSeconds) => `
    [out:json][timeout:${timeoutSeconds}];
    way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"](${b.south},${b.west},${b.north},${b.east});
    (._;>;);
    out body;
  `;

  const shrinkBounds = (b, factor) => {
    const centerLat = (b.north + b.south) / 2;
    const centerLon = (b.east + b.west) / 2;
    const latHalf = ((b.north - b.south) * factor) / 2;
    const lonHalf = ((b.east - b.west) * factor) / 2;
    return {
      south: centerLat - latHalf,
      west: centerLon - lonHalf,
      north: centerLat + latHalf,
      east: centerLon + lonHalf
    };
  };

  const attempts = [
    { bounds, timeout: 35 },
    { bounds: shrinkBounds(bounds, 0.8), timeout: 40 }
  ];

  for (const attempt of attempts) {
    const query = makeQuery(attempt.bounds, attempt.timeout);
    for (const server of servers) {
      try {
        const response = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal
        });
        if (response.ok) return response.json();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }
  }
  
  // Fallback to local data if all servers fail
  // We use fetch to load data from public/data folder to avoid bundling large JSON files
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLon = (bounds.east + bounds.west) / 2;
  
  const baseUrl = import.meta.env.BASE_URL; // e.g. /GPS-tracker/ or /

  let localFile = null;

  // Toronto approx: 43.66, -79.36
  if (Math.abs(centerLat - 43.66) < 0.2 && Math.abs(centerLon - (-79.36)) < 0.2) {
    localFile = 'toronto.json';
  }
  // Seoul approx: 37.56, 126.97
  else if (Math.abs(centerLat - 37.56) < 0.2 && Math.abs(centerLon - 126.97) < 0.2) {
    localFile = 'seoul.json';
  }
  // New York approx: 40.75, -73.98
  else if (Math.abs(centerLat - 40.75) < 0.2 && Math.abs(centerLon - (-73.98)) < 0.2) {
    localFile = 'new_york.json';
  }
  // Tokyo approx: 35.67, 139.77
  else if (Math.abs(centerLat - 35.67) < 0.2 && Math.abs(centerLon - 139.77) < 0.2) {
    localFile = 'tokyo.json';
  }
  // Barcelona approx: 41.39, 2.17
  else if (Math.abs(centerLat - 41.39) < 0.2 && Math.abs(centerLon - 2.17) < 0.2) {
    localFile = 'barcelona.json';
  }
  // Paris approx: 48.87, 2.29
  else if (Math.abs(centerLat - 48.87) < 0.2 && Math.abs(centerLon - 2.29) < 0.2) {
    localFile = 'paris.json';
  }
  // London approx: 51.50, -0.07
  else if (Math.abs(centerLat - 51.50) < 0.2 && Math.abs(centerLon - (-0.07)) < 0.2) {
    localFile = 'london.json';
  }
  // San Francisco approx: 37.81, -122.47
  else if (Math.abs(centerLat - 37.81) < 0.2 && Math.abs(centerLon - (-122.47)) < 0.2) {
    localFile = 'sanfrancisco.json';
  }
  // Moscow approx: 55.75, 37.62
  else if (Math.abs(centerLat - 55.75) < 0.2 && Math.abs(centerLon - 37.62) < 0.2) {
    localFile = 'moscow.json';
  }
  // Dubai approx: 25.11, 55.13
  else if (Math.abs(centerLat - 25.11) < 0.2 && Math.abs(centerLon - 55.13) < 0.2) {
    localFile = 'dubai.json';
  }
  // Mexico City approx: 19.43, -99.13
  else if (Math.abs(centerLat - 19.43) < 0.2 && Math.abs(centerLon - (-99.13)) < 0.2) {
    localFile = 'mexicocity.json';
  }
  // Rome approx: 41.90, 12.49
  else if (Math.abs(centerLat - 41.90) < 0.2 && Math.abs(centerLon - 12.49) < 0.2) {
    localFile = 'rome.json';
  }

  if (localFile) {
    const response = await fetch(`${baseUrl}data/${localFile}`);
    if (!response.ok) throw new Error(`Failed to load local data: ${localFile}`);
    return response.json();
  }

  throw new Error('All Overpass servers failed and no local data matched');
};

const buildGraph = (osmData) => {
  const nodes = {};
  const edges = {};
  const ways = [];
  const nodeNames = {};
  osmData.elements.forEach(el => {
    if (el.type === 'node') nodes[el.id] = { lat: el.lat, lon: el.lon };
  });
  osmData.elements.forEach(el => {
    if (el.type === 'way' && el.nodes) {
      const roadName = el.tags?.name || el.tags?.highway || null;
      const wayCoords = el.nodes
        .filter(id => nodes[id])
        .map(id => {
          if (roadName) nodeNames[id] = roadName;
          return [nodes[id].lat, nodes[id].lon];
        });
      if (wayCoords.length > 1) ways.push(wayCoords);
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const from = el.nodes[i], to = el.nodes[i+1];
        if (nodes[from] && nodes[to]) {
          if (!edges[from]) edges[from] = [];
          if (!edges[to]) edges[to] = [];
          edges[from].push(to);
          edges[to].push(from);
        }
      }
    }
  });
  return { nodes, edges, ways, nodeNames };
};

export const useRoadNetwork = (bounds, cityKey) => {
  const [graph, setGraph] = useState({ nodes: {}, edges: {}, ways: [], nodeNames: {} });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Simplified loading logic for restoration
  const load = useCallback(async (currentBounds, signal) => {
    if (!currentBounds) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRoadNetwork(currentBounds, signal);
      const graphData = buildGraph(data);
      setGraph(graphData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('error_loading');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { graph, setGraph, isLoading, setIsLoading, error, refetch: load, fetchRoadNetwork, buildGraph };
};
