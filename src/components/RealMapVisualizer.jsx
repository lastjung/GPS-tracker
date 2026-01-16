import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Fetch road network from OSM Overpass API
const fetchRoadNetwork = async (bounds) => {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
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
    { bounds, timeout: 25 },
    { bounds: shrinkBounds(bounds, 0.7), timeout: 30 },
    { bounds: shrinkBounds(bounds, 0.5), timeout: 35 }
  ];

  for (const attempt of attempts) {
    const query = makeQuery(attempt.bounds, attempt.timeout);
    for (const server of servers) {
      try {
        const response = await fetch(server, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `data=${encodeURIComponent(query)}`
        });
        if (response.ok) {
          return response.json();
        }
      } catch (e) {
        console.log(`Server ${server} failed, trying next...`);
      }
    }
  }

  throw new Error('All Overpass servers failed');
};

// Build graph from OSM data
const buildGraph = (osmData) => {
  const nodes = {};
  const edges = {};
  const ways = [];
  
  // First pass: collect all nodes
  osmData.elements.forEach(el => {
    if (el.type === 'node') {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
    }
  });
  
  // Second pass: build edges from ways
  osmData.elements.forEach(el => {
    if (el.type === 'way' && el.nodes) {
      const wayCoords = el.nodes
        .filter(nodeId => nodes[nodeId])
        .map(nodeId => [nodes[nodeId].lat, nodes[nodeId].lon]);
      
      if (wayCoords.length > 1) {
        ways.push(wayCoords);
      }
      
      // Build adjacency list
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const from = el.nodes[i];
        const to = el.nodes[i + 1];
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

// Haversine distance calculation
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// Dijkstra algorithm with visualization steps
function* dijkstraOnGraph(nodes, edges, startId, endId) {
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
      yield { type: 'found', path, visitedEdges };
      return;
    }
    
    const neighbors = edges[currentId] || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      
      const current = nodes[currentId];
      const neighbor = nodes[neighborId];
      const weight = haversine(current.lat, current.lon, neighbor.lat, neighbor.lon);
      const newDist = dist + weight;
      
      if (distances[neighborId] === undefined || newDist < distances[neighborId]) {
        distances[neighborId] = newDist;
        previous[neighborId] = currentId;
        pq.push([newDist, neighborId]);
        visitedEdges.push([[current.lat, current.lon], [neighbor.lat, neighbor.lon]]);
        yield { type: 'visiting', visitedEdges: [...visitedEdges] };
      }
    }
  }
  
  yield { type: 'not_found' };
}

// A* algorithm - much faster, goes toward goal
function* astarOnGraph(nodes, edges, startId, endId) {
  const endNode = nodes[endId];
  const gScore = { [startId]: 0 };
  const fScore = { [startId]: haversine(nodes[startId].lat, nodes[startId].lon, endNode.lat, endNode.lon) };
  const previous = {};
  const visited = new Set();
  const visitedEdges = [];
  const openSet = [[fScore[startId], startId]];
  
  while (openSet.length > 0) {
    openSet.sort((a, b) => a[0] - b[0]);
    const [, currentId] = openSet.shift();
    
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
      yield { type: 'found', path, visitedEdges };
      return;
    }
    
    const neighbors = edges[currentId] || [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      
      const current = nodes[currentId];
      const neighbor = nodes[neighborId];
      const tentativeG = gScore[currentId] + haversine(current.lat, current.lon, neighbor.lat, neighbor.lon);
      
      if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
        previous[neighborId] = currentId;
        gScore[neighborId] = tentativeG;
        fScore[neighborId] = tentativeG + haversine(neighbor.lat, neighbor.lon, endNode.lat, endNode.lon);
        openSet.push([fScore[neighborId], neighborId]);
        visitedEdges.push([[current.lat, current.lon], [neighbor.lat, neighbor.lon]]);
        yield { type: 'visiting', visitedEdges: [...visitedEdges] };
      }
    }
  }
  
  yield { type: 'not_found' };
}

const ALGORITHMS = {
  astar: { name: 'A* Search', fn: astarOnGraph, description: 'Goal-directed heuristic search' },
  dijkstra: { name: 'Dijkstra', fn: dijkstraOnGraph, description: 'Uniform cost exploration' }
};

// Find nearest node to a lat/lng and return both id and coordinates
const findNearestNode = (nodes, lat, lng) => {
  let nearest = null;
  let minDist = Infinity;
  
  const nodeEntries = Object.entries(nodes);
  if (nodeEntries.length === 0) return null;

  for (const [id, node] of nodeEntries) {
    const dist = Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lng, 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = Number(id);
    }
  }
  return nearest;
};

const findNearestNodeCoords = (nodes, lat, lng) => {
  let nearestCoords = null;
  let minDist = Infinity;
  
  const nodeValues = Object.values(nodes);
  if (nodeValues.length === 0) return null;

  for (const node of nodeValues) {
    const dist = Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lng, 2);
    if (dist < minDist) {
      minDist = dist;
      nearestCoords = { lat: node.lat, lng: node.lon };
    }
  }
  
  // ~300m threshold for urban density (increased from 0.00001)
  if (minDist > 0.0003) { 
    return null;
  }
  
  return nearestCoords;
};

// Component to load roads when map moves
const RoadLoader = ({ setBounds, isMapLocked }) => {
  const map = useMap();
  
  useEffect(() => {
    const updateBounds = () => {
      const b = map.getBounds();
      if (!b) return;
      setBounds({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast()
      });
    };
    
    // Always listen for moveend so programmatic flyToBounds updates bounds
    map.on('moveend', updateBounds);
    
    // Always trigger once on load/lock change to ensure initial data
    updateBounds();
    
    return () => map.off('moveend', updateBounds);
  }, [map, setBounds, isMapLocked]);
  
  return null;
};

// Map click handler that snaps to nearest road (auto-toggle)
const MapClickHandler = ({ graph, start, end, setStart, setEnd, setVisitedEdges, setFinalPath, setStatus, isRunning }) => {
  useMapEvents({
    click: (e) => {
      if (isRunning || Object.keys(graph.nodes).length === 0) return;
      
      const snapped = findNearestNodeCoords(graph.nodes, e.latlng.lat, e.latlng.lng);
      if (!snapped) {
        setStatus('click_too_far');
        setTimeout(() => setStatus('idle'), 2000);
        return;
      }
      
      setStatus('idle');
      // Auto-toggle: if no start → set start, if start but no end → set end, else reset
      if (!start) {
        setStart(snapped);
        setVisitedEdges([]);
        setFinalPath([]);
      } else if (!end) {
        setEnd(snapped);
        setVisitedEdges([]);
        setFinalPath([]);
      } else {
        // Reset and set new start
        setStart(snapped);
        setEnd(null);
        setVisitedEdges([]);
        setFinalPath([]);
      }
    }
  });
  return null;
};

// City presets
const CITIES = {
  toronto: {
    name: 'Toronto',
    center: [43.6600, -79.3650], 
    start: { lat: 43.6850, lng: -79.3400 }, // Northeast end
    end: { lat: 43.6426, lng: -79.3871 }    // CN Tower
  },
  newyork: {
    name: 'New York (Manhattan)',
    center: [40.7560, -73.9850], // Mid-town centered
    start: { lat: 40.7100, lng: -74.0100 }, // World Trade Center area (Slightly further north for visibility)
    end: { lat: 40.8000, lng: -73.9500 }    // Harlem / Central Park North
  },
  tokyo: {
    name: 'Tokyo (Bay View)',
    center: [35.6715, 139.7700], // Balanced center between Ueno and Odaiba
    start: { lat: 35.7130, lng: 139.7740 }, // Ueno
    end: { lat: 35.6300, lng: 139.7760 }    // Odaiba
  },
  seoul: {
    name: 'Seoul',
    center: [37.5385, 127.0200], 
    start: { lat: 37.5665, lng: 126.9780 }, // Seoul City Hall Intersection
    end: { lat: 37.5125, lng: 127.0588 }    // Coex Building (Main Road side)
  }
};

const boundsFromPoints = (a, b, padding = 0.01) => {
  const south = Math.min(a.lat, b.lat) - padding;
  const north = Math.max(a.lat, b.lat) + padding;
  const west = Math.min(a.lng, b.lng) - padding;
  const east = Math.max(a.lng, b.lng) + padding;
  return { south, west, north, east };
};

const RealMapVisualizer = () => {
  const [cityKey, setCityKey] = useState('toronto'); // Default to Toronto
  const city = CITIES[cityKey];
  
  const [graph, setGraph] = useState({ nodes: {}, edges: {}, ways: [] });
  const [start, setStart] = useState(city.start);
  const [end, setEnd] = useState(city.end);
  const [visitedEdges, setVisitedEdges] = useState([]);
  const [finalPath, setFinalPath] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [speed, setSpeed] = useState(25); // Default speed set higher
  const [algorithm, setAlgorithm] = useState('astar');
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState({ edges: 0, time: 0, distance: 0 });
  const [density, setDensity] = useState(6); // Default density increased to 6
  const [showVisualization, setShowVisualization] = useState(true); // New toggle state
  const [processingDots, setProcessingDots] = useState('');
  const [displayMode, setDisplayMode] = useState('Visualize');
  const [isMapLocked, setIsMapLocked] = useState(true); // Locked by default as requested
  
  // Refs for tracking animation and intervals
  const animationRef = useRef(null);
  const dotsIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  
  // Map flyTo logic when city changes
  const ChangeView = ({ center, isMapLocked }) => {
    const map = useMap();
    useEffect(() => {
      if (center) {
        // Automatically fit both start and end points in view with padding
        const bounds = [
          [city.start.lat, city.start.lng],
          [city.end.lat, city.end.lng]
        ];
        map.flyToBounds(bounds, { 
          paddingBottomRight: [50, 120], // Add more space at bottom to see lake/sea
          paddingTopLeft: [50, 50],
          duration: 1.5 
        });
      }
    }, [center, map, city.start, city.end]);

    useEffect(() => {
      if (isMapLocked) {
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
      } else {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
      }
    }, [isMapLocked, map]);

    return null;
  };

  const handleCityChange = (key) => {
    stopAlgorithm();
    const newCity = CITIES[key];
    setCityKey(key);
    setStart(newCity.start);
    setEnd(newCity.end);
    setBounds(boundsFromPoints(newCity.start, newCity.end, 0.01));
    setGraph({ nodes: {}, edges: {}, ways: [] }); // Clear old graph
    setVisitedEdges([]);
    setFinalPath([]);
    setStatus('idle');
    setStats({ edges: 0, time: 0, distance: 0 });
    setProcessingDots('');
  };

  useEffect(() => {
    if (!bounds) return; // Allow loading even if locked to get initial data
    
    // Prevent reloading if graph is already loaded for this area
    if (graph.ways.length > 0 && Object.keys(graph.nodes).length > 0) {
       setIsLoading(false); 
       return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchRoadNetwork(bounds);
        const graphData = buildGraph(data);
        setGraph(graphData);
        if (status === 'error_loading') setStatus('idle');
      } catch (err) {
        console.error('Failed to load roads:', err);
        setStatus('error_loading');
      } finally {
        setIsLoading(false);
      }
    };
    
    const timeout = setTimeout(load, 400); 
    return () => clearTimeout(timeout);
  }, [bounds, graph.ways.length]);
  
  const runAlgorithm = useCallback(() => {
    if (!start || !end || Object.keys(graph.nodes).length === 0) {
      console.warn('Road network not ready');
      return;
    }
    
    const startId = findNearestNode(graph.nodes, start.lat, start.lng);
    const endId = findNearestNode(graph.nodes, end.lat, end.lng);
    
    if (!startId || !endId) {
      console.warn('Start or end point too far from road');
      setStatus('click_too_far');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }
    
    if (startId === endId) {
      setStatus('idle');
      return;
    }
    
    setIsRunning(true);
    setStatus('running');
    setVisitedEdges([]);
    setFinalPath([]);
    
    const gen = ALGORITHMS[algorithm].fn(graph.nodes, graph.edges, startId, endId);
    let totalSteps = 0;
    
    // Processing dots animation
    let dotCount = 0;
    dotsIntervalRef.current = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setProcessingDots('.'.repeat(dotCount));
    }, 300);
    
    startTimeRef.current = Date.now();
    
    // Immediate mode: Fast forward to end if visualization is disabled
    if (!showVisualization) {
      let result = null;
      for (const val of gen) {
        result = val;
        if (val.type === 'found' || val.type === 'not_found') break;
      }
      
      if (result && result.type === 'found') {
        const elapsed = Date.now() - startTimeRef.current;
        let distance = 0;
        for (let i = 0; i < result.path.length - 1; i++) {
          distance += haversine(result.path[i][0], result.path[i][1], result.path[i+1][0], result.path[i+1][1]);
        }
        setVisitedEdges(result.visitedEdges);
        setFinalPath(result.path);
        setStats({ edges: result.visitedEdges.length, time: elapsed, distance: distance * 1000 });
        setStatus('success');
      } else {
        setStatus('no_path');
      }
      setIsRunning(false);
      clearInterval(dotsIntervalRef.current);
      setProcessingDots('');
      return;
    }

    const step = () => {
      let iterations = 0;
      let lastValue = null;
      
      // Values now strictly mapping: higher speed = more steps per tick
      const stepsPerTick = speed <= 10 ? 20 : speed <= 25 ? 50 : 120;
      
      while (iterations < stepsPerTick) {
        const { value, done } = gen.next();
        
        if (done || !value) {
          if (!lastValue) {
            setIsRunning(false);
            if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
            return;
          }
          break;
        }
        
        lastValue = value;
        totalSteps++;
        if (value.type === 'found' || value.type === 'not_found') break;
        iterations++;
      }
      
      if (lastValue.type === 'visiting') {
        const allEdges = lastValue.visitedEdges;
        const filteredEdges = density === 1 
          ? allEdges 
          : allEdges.filter((_, i) => i % density === 0);
          
        setVisitedEdges(filteredEdges); // Removed .slice(-1000) to keep ALL edges
        setStats(prev => ({ ...prev, edges: allEdges.length }));
        
        // Lower delay means faster visualization
        const delay = Math.max(1, 41 - speed); 
        animationRef.current = setTimeout(step, delay);
      } else if (lastValue.type === 'found') {
        clearInterval(dotsIntervalRef.current);
        setProcessingDots('');
        const elapsed = Date.now() - startTimeRef.current;
        let distance = 0;
        for (let i = 0; i < lastValue.path.length - 1; i++) {
          distance += haversine(lastValue.path[i][0], lastValue.path[i][1], lastValue.path[i+1][0], lastValue.path[i+1][1]);
        }
        setVisitedEdges(lastValue.visitedEdges); // FULL edges on success
        setFinalPath(lastValue.path);
        setStats({ edges: lastValue.visitedEdges.length, time: elapsed, distance: distance * 1000 });
        setStatus('success');
        setIsRunning(false);
      } else {
        clearInterval(dotsIntervalRef.current);
        setProcessingDots('');
        setStatus('no_path');
        setIsRunning(false);
      }
    };
    
    startTimeRef.current = Date.now();
    setStatus('running');
    step();
  }, [start, end, graph, speed, algorithm, density, showVisualization]);
  
  const stopAlgorithm = useCallback(() => {
    if (animationRef.current) clearTimeout(animationRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    setProcessingDots('');
    setIsRunning(false);
  }, []);
  
  const resetAll = useCallback(() => {
    stopAlgorithm();
    setStart(city.start);
    setEnd(city.end);
    setVisitedEdges([]);
    setFinalPath([]);
    setStatus('idle');
    setStats({ edges: 0, time: 0, distance: 0 });
    setProcessingDots('');
  }, [stopAlgorithm, city.start, city.end]);
  
  return (
    <div className="relative w-full h-screen">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-[1000] bg-gray-900/90 p-4 rounded-lg text-white backdrop-blur-sm border border-gray-700 max-w-xs">
        <h2 className="text-xl font-bold mb-1 text-cyan-400">Path Finder</h2>
        
        {/* City Selector */}
        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs text-gray-400">City: <span className="text-cyan-300 font-bold">{city.name}</span></label>
          <select
            value={cityKey}
            onChange={(e) => handleCityChange(e.target.value)}
            disabled={isRunning}
            className="bg-gray-700 text-white px-3 py-2 rounded w-full border border-gray-600 focus:border-cyan-500 outline-none"
          >
            {Object.entries(CITIES).map(([key, c]) => (
              <option key={key} value={key}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Mode Toggle (Placeholder) */}
        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs text-gray-400">Mode</label>
          <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
            <button 
              className={`flex-1 text-[10px] py-1 rounded ${displayMode === 'Visualize' ? 'bg-cyan-600' : 'hover:bg-gray-700'}`}
              onClick={() => setDisplayMode('Visualize')}
            >Visualize</button>
            <button 
              className={`flex-1 text-[10px] py-1 rounded ${displayMode === 'Route' ? 'bg-cyan-600' : 'hover:bg-gray-700'}`}
              onClick={() => setDisplayMode('Route')}
            >Route</button>
          </div>
        </div>

        {/* Current Algorithm Display */}
        <div className="mb-3 p-2 bg-gray-800 rounded border border-cyan-500">
          <div className="text-lg font-bold text-yellow-400">{ALGORITHMS[algorithm].name}</div>
          <div className="text-xs text-gray-400">{ALGORITHMS[algorithm].description}</div>
        </div>
        
        <p className="text-xs text-gray-400 mb-3">
          {!start ? '1st click: Set START' : !end ? '2nd click: Set END' : 'Click map to reset'}
        </p>
        
        {/* Algorithm Selector */}
        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs text-gray-400">Algorithm</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            disabled={isRunning}
            className="bg-gray-700 text-white px-3 py-2 rounded w-full"
          >
            {Object.entries(ALGORITHMS).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-xs text-gray-400">
            Speed: {speed} {speed <= 10 ? '(Slow)' : speed >= 40 ? '(Fast)' : ''}
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        {/* Visualization & View Controls */}
        <div className="flex flex-col gap-2 mb-3 bg-gray-800/50 p-2 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="vizToggle"
              checked={showVisualization} 
              onChange={(e) => setShowVisualization(e.target.checked)}
              disabled={isRunning}
              className="w-4 h-4 rounded accent-cyan-500"
            />
            <label htmlFor="vizToggle" className="text-xs text-gray-300 cursor-pointer">Show Steps</label>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="lockToggle"
              checked={isMapLocked} 
              onChange={(e) => setIsMapLocked(e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <label htmlFor="lockToggle" className="text-xs text-orange-300 font-bold cursor-pointer">Lock Map View</label>
          </div>
        </div>
        
        {/* Density Slider */}
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-xs text-gray-400">Path Density: 1/{density}</label>
          <input
            type="range"
            min="1"
            max="10"
            value={density}
            onChange={(e) => setDensity(Number(e.target.value))}
            disabled={isRunning}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>
        
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={runAlgorithm}
              disabled={!start || !end || isLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded font-bold flex-1"
            >▶ Start</button>
          ) : (
            <button
              onClick={stopAlgorithm}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold flex-1"
            >■ Stop</button>
          )}
          <button
            onClick={resetAll}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
          >Reset</button>
        </div>
        
        <div className="mt-3">
          {isLoading && graph.ways.length === 0 && (
            <p className="text-yellow-400 text-sm">🔄 Loading road network...</p>
          )}
          {status === 'running' && (
            <p className="text-cyan-400 text-lg font-mono processing-text">
              Calculating{processingDots}
            </p>
          )}
          {status === 'success' && <p className="text-orange-500 text-2xl font-black success-flash italic tracking-tighter">🏁 Path found!</p>}
          {status === 'no_path' && <p className="text-red-400 text-sm">❌ No connected path found.</p>}
          {status === 'click_too_far' && <p className="text-orange-400 text-sm">⚠️ Too far from road. Click on blue lines!</p>}
          {status === 'error_loading' && <p className="text-red-500 text-sm">❌ Loading failed. Please retry.</p>}
          {!isLoading && graph.ways.length === 0 && <p className="text-orange-400 text-sm">⚠️ No road data in this area.</p>}
        </div>
        
        {/* Stats Panel */}
        {(status === 'success' || status === 'running') && (
          <div className="mt-3 p-2 bg-gray-800 rounded text-xs border border-gray-700">
            <div className="flex justify-between"><span>Edges explored:</span><span className="text-cyan-400 font-bold">{stats.edges}</span></div>
            {status === 'success' && (
              <>
                <div className="flex justify-between"><span>Time:</span><span className="text-green-400">{stats.time}ms</span></div>
                <div className="flex justify-between"><span>Distance:</span><span className="text-orange-400 font-bold">{stats.distance.toFixed(0)}m</span></div>
              </>
            )}
          </div>
        )}
        
        {/* Retry Button */}
        {status === 'no_path' && (
          <button
            onClick={resetAll}
            className="mt-2 w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-bold"
          >🔄 Try Another Route</button>
        )}
        
        {/* Click Guide */}
        <p className="mt-3 text-xs text-blue-300">💡 Click on blue roads only</p>
        
        <div className="mt-2 text-xs text-gray-500">
          Roads: {graph.ways.length}
        </div>
      </div>
      
      {/* Map with dimming effect */}
      <MapContainer 
        center={city.center} 
        zoom={13} 
        className={`w-full h-full ${isRunning ? 'map-dimmed' : 'map-normal'}`}
      >
        <ChangeView center={city.center} isMapLocked={isMapLocked} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <RoadLoader setBounds={setBounds} isMapLocked={isMapLocked} />
        <MapClickHandler
          graph={graph}
          start={start}
          end={end}
          setStart={setStart}
          setEnd={setEnd}
          setVisitedEdges={setVisitedEdges}
          setFinalPath={setFinalPath}
          setStatus={setStatus}
          isRunning={isRunning}
        />
        
        {/* Boundary Box */}
        {bounds && (
          <Rectangle
            bounds={[[bounds.south, bounds.west], [bounds.north, bounds.east]]}
            pathOptions={{ color: '#fbbf24', weight: 2, fill: false, dashArray: '5, 5' }}
          />
        )}
        
        {/* All roads (High Performance Multi-Polyline) */}
        {graph.ways.length > 0 && (
          <Polyline 
            positions={graph.ways} 
            color="#1e40af" 
            weight={1} 
            opacity={0.3} 
          />
        )}
        
        {/* Visited edges (Spiderweb effect - Multi-Polyline for High Performance) */}
        {visitedEdges.length > 0 && (
          <Polyline 
            positions={visitedEdges} 
            pathOptions={{
              color: '#06b6d4',
              weight: 3,
              opacity: 0.6,
              className: 'edge-trail'
            }}
          />
        )}
        
        {/* Final path with Orange glow effect - Toned down */}
        {finalPath.length > 0 && (
          <>
            <Polyline 
              positions={finalPath} 
              pathOptions={{
                color: '#f97316',
                weight: 8,
                opacity: 0.3,
                className: 'path-glow'
              }}
            />
            <Polyline 
              positions={finalPath} 
              pathOptions={{
                color: '#f97316',
                weight: 4,
                opacity: 0.9,
                className: 'path-glow'
              }}
            />
          </>
        )}
        
        {/* Start/End markers */}
        {start && <CircleMarker center={start} radius={8} fillColor="#22c55e" fillOpacity={1} color="#fff" weight={2} />}
        {end && <CircleMarker center={end} radius={8} fillColor="#ef4444" fillOpacity={1} color="#fff" weight={2} />}
      </MapContainer>
    </div>
  );
};

export default RealMapVisualizer;
