import { useState, useCallback, useRef } from 'react';
import torontoData from '../data/toronto.json';
import seoulData from '../data/seoul.json';
import newYorkData from '../data/new_york.json';
import tokyoData from '../data/tokyo.json';

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
  
  // Fallback to local data if all servers fail and we are in Toronto
  // Check if bounds roughly match Toronto center
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLon = (bounds.east + bounds.west) / 2;
  // Toronto center approx: 43.66, -79.36
  if (Math.abs(centerLat - 43.66) < 0.2 && Math.abs(centerLon - (-79.36)) < 0.2) {
    console.warn('Using local fallback data for Toronto.');
    return torontoData;
  }
  // Seoul center approx: 37.56, 126.97
  if (Math.abs(centerLat - 37.56) < 0.2 && Math.abs(centerLon - 126.97) < 0.2) {
    console.warn('Using local fallback data for Seoul.');
    return seoulData;
  }
  // New York center approx: 40.75, -73.98
  if (Math.abs(centerLat - 40.75) < 0.2 && Math.abs(centerLon - (-73.98)) < 0.2) {
    console.warn('Using local fallback data for New York.');
    return newYorkData;
  }
  // Tokyo center approx: 35.67, 139.77
  if (Math.abs(centerLat - 35.67) < 0.2 && Math.abs(centerLon - 139.77) < 0.2) {
    console.warn('Using local fallback data for Tokyo.');
    return tokyoData;
  }

  throw new Error('All Overpass servers failed');
};

const buildGraph = (osmData) => {
  const nodes = {};
  const edges = {};
  const ways = [];
  osmData.elements.forEach(el => {
    if (el.type === 'node') nodes[el.id] = { lat: el.lat, lon: el.lon };
  });
  osmData.elements.forEach(el => {
    if (el.type === 'way' && el.nodes) {
      const wayCoords = el.nodes
        .filter(id => nodes[id])
        .map(id => [nodes[id].lat, nodes[id].lon]);
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
  return { nodes, edges, ways };
};

export const useRoadNetwork = (bounds, cityKey) => {
  const [graph, setGraph] = useState({ nodes: {}, edges: {}, ways: [] });
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
        console.error(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { graph, setGraph, isLoading, setIsLoading, error, refetch: load, fetchRoadNetwork, buildGraph };
};
