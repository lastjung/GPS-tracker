import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Rectangle, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Sound effects using Web Audio API
const audioContextRef = { current: null };

const getAudioContext = () => {
  if (!audioContextRef.current) {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContextRef.current;
};

// Play a beep sound for countdown (cheerful, short)
const playBeep = (frequency = 880, duration = 0.15) => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log('Audio not supported');
  }
};

// Play success sound (ascending chime)
const playSuccess = () => {
  try {
    const ctx = getAudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.3);
      
      oscillator.start(ctx.currentTime + i * 0.12);
      oscillator.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch (e) {
    console.log('Audio not supported');
  }
};

// Play subtle tick during searching (soft click)
const playSearchTick = () => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1200 + Math.random() * 400, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.03);
  } catch (e) {}
};

// Fetch road network from OSM Overpass API
const fetchRoadNetwork = async (bounds) => {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://api.openstreetmap.fr/oapi/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
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
    { bounds: shrinkBounds(bounds, 0.8), timeout: 40 },
    { bounds: shrinkBounds(bounds, 0.6), timeout: 45 }
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
      yield { type: 'found', path, visitedEdges, totalDistance: dist };
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
        yield { type: 'visiting', visitedEdges: [...visitedEdges], currentDistance: newDist };
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
      yield { type: 'found', path, visitedEdges, totalDistance: gScore[endId] };
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
        yield { type: 'visiting', visitedEdges: [...visitedEdges], currentDistance: tentativeG };
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
const MapClickHandler = ({ graph, start, end, setStart, setEnd, setVisitedEdges, setFinalPath, setStatus, isRunning, showMenu, setShowMenu }) => {
  useMapEvents({
      click: (e) => {
        if (isRunning) return;
        
        // Show menu if hidden
        if (!showMenu) {
          setShowMenu(true);
          return;
        }

        if (Object.keys(graph.nodes).length === 0) return;
        
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
  const [density, setDensity] = useState(1); // Show all edges by default
  const [showVisualization, setShowVisualization] = useState(true); // New toggle state
  const [processingDots, setProcessingDots] = useState('');
  const [displayMode, setDisplayMode] = useState('Visualize');
  const [isMapLocked, setIsMapLocked] = useState(true); // Locked by default as requested
  const [isShortsMode, setIsShortsMode] = useState(false); // 9:16 Shorts Guide Mode
  const [delayedStart, setDelayedStart] = useState(false); // 3-second delay before start (disabled)
  const [countdown, setCountdown] = useState(null); // Countdown display
  const [recordMode, setRecordMode] = useState(false); // Vertical recording mode

  const [isRecording, setIsRecording] = useState(false); // Recording state
  const [showMenu, setShowMenu] = useState(true); // Toggle for Menu Panel visibility
  
  // Refs for tracking animation and intervals
  const animationRef = useRef(null);
  const dotsIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const recordContainerRef = useRef(null); // Ref for recording area
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const pendingStreamRef = useRef(null); // Store stream until countdown finishes
  const lastFitRef = useRef(0); // Lock for fitToRoute to prevent shaking
  
  // Drag state for Menu Panel
  const [menuPanelPos, setMenuPanelPos] = useState(null);
  const [isDraggingMenu, setIsDraggingMenu] = useState(false);
  const menuDragOffset = useRef({ x: 0, y: 0 });

  // Drag state for Score Panel
  const [scorePanelPos, setScorePanelPos] = useState(null);
  const [isDraggingScore, setIsDraggingScore] = useState(false);
  const scoreDragOffset = useRef({ x: 0, y: 0 });
  
  // Map flyTo logic when city changes - Enhanced to respect Shorts Mode padding
  const ChangeView = ({ center, isMapLocked, isShortsMode, city }) => {
    const map = useMap();
    const lastFitRef = useRef(0);
    
    const fitToRoute = useCallback(() => {
      if (!city || !city.start || !city.end) return;
      
      const bounds = [
        [city.start.lat, city.start.lng],
        [city.end.lat, city.end.lng]
      ];
      
      // Dynamic horizontal padding for Shorts Mode
      let hPadding = 50;
      if (isShortsMode) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const shortsWidth = viewportHeight * 9 / 16;
        // Padding on one side = (Total width - Shorts Width) / 2
        hPadding = (viewportWidth - shortsWidth) / 2 + 20; // Reduced buffer to 20 for tighter fit
      }

      // 0.6s Debounce / Lock for Shorts Mode to prevent double-zoom shaking
      const now = Date.now();
      if (isShortsMode && now - lastFitRef.current < 600) return;
      lastFitRef.current = now;

      map.flyToBounds(bounds, { 
        paddingBottomRight: [hPadding, 120],
        paddingTopLeft: [hPadding, 50],
        duration: isShortsMode ? 0 : 1.5, // Snap in Shorts Mode for stability
        animate: !isShortsMode // No animation in Shorts Mode to prevent shaking
      });

      if (isShortsMode) {
        // Run zoom boost once after snap
        setTimeout(() => {
          map.setZoom(map.getZoom() + 0.35);
        }, 50); // Small delay after snap to ensure bounds are settled
      }
    }, [map, city, isShortsMode]);

    useEffect(() => {
      if (!center) return;
      const now = Date.now();
      if (now - lastFitRef.current < 600) return;
      lastFitRef.current = now;
      const delay = isShortsMode ? 250 : 0;
      const timer = setTimeout(fitToRoute, delay);
      return () => clearTimeout(timer);
    }, [center, isShortsMode, fitToRoute]);

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
    setShowMenu(true); // Always show menu on city change
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
    
    // Only use countdown if explicitly requested (e.g. for recording)
    if (delayedStart && countdown === null) {
      setCountdown(3);
      return;
    }
    
    setIsRunning(true);
    setStatus('running');
    setVisitedEdges([]);
    setFinalPath([]);
    setShowMenu(false); // Hide menu while running and keep hidden after finish
    
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
        
        // Use precise distance calculated by algorithm
        let distance = result.totalDistance * 1000;
        
        // Fallback calculation if missing (legacy)
        if (distance === undefined || distance === null) {
          distance = 0;
          for (let i = 0; i < result.path.length - 1; i++) {
            distance += haversine(result.path[i][0], result.path[i][1], result.path[i+1][0], result.path[i+1][1]);
          }
          distance *= 1000;
        }

        setVisitedEdges(result.visitedEdges);
        setFinalPath(result.path);
        setStats({ edges: result.visitedEdges.length, time: elapsed, distance: distance });
        setStatus('success');
        playSuccess();
      } else {
        setStatus('no_path');
      }
      setIsRunning(false);
      clearInterval(dotsIntervalRef.current);
      setProcessingDots('');
      
      // Auto stop recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        setTimeout(() => {
          mediaRecorderRef.current.stop();
        }, 1500); // Wait 1.5s to capture final result
      }
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
        
        // Play subtle tick every ~10 frames
        if (allEdges.length % 50 === 0) playSearchTick();
        
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
        playSuccess();
        setIsRunning(false);
        // Auto stop recording if active
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          setTimeout(() => mediaRecorderRef.current.stop(), 1500);
        }
      } else {
        clearInterval(dotsIntervalRef.current);
        setProcessingDots('');
        setStatus('no_path');
        setIsRunning(false);
        // Auto stop recording if active
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          setTimeout(() => mediaRecorderRef.current.stop(), 1500);
        }
      }
    };
    
    startTimeRef.current = Date.now();
    setStatus('running');
    step();
  }, [start, end, graph, speed, algorithm, density, showVisualization, delayedStart, countdown]);

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown > 0) {
      playBeep(880 + (3 - countdown) * 220); // Higher pitch as countdown goes down
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished, start the algorithm
      // Set recording state FIRST to prevent control panel flash
      if (pendingStreamRef.current) {
        setIsRecording(true);
      }
      setCountdown(null);
      // Re-call runAlgorithm which will now proceed since countdown is null
      setTimeout(() => {
        // Start recording now if stream is pending
        if (pendingStreamRef.current) {
          const stream = pendingStreamRef.current;
          mediaRecorderRef.current = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 5000000
          });
          
          mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          
          mediaRecorderRef.current.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gps-tracker-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            setIsRecording(false);
            pendingStreamRef.current = null;
          };
          
          mediaRecorderRef.current.start();
          setIsRecording(true);
        }
        
        setIsRunning(true);
        setStatus('running');
        setVisitedEdges([]);
        setFinalPath([]);
        
        const startId = findNearestNode(graph.nodes, start.lat, start.lng);
        const endId = findNearestNode(graph.nodes, end.lat, end.lng);
        
        const gen = ALGORITHMS[algorithm].fn(graph.nodes, graph.edges, startId, endId);
        
        let dotCount = 0;
        dotsIntervalRef.current = setInterval(() => {
          dotCount = (dotCount + 1) % 4;
          setProcessingDots('.'.repeat(dotCount));
        }, 300);
        
        startTimeRef.current = Date.now();
        
        const step = () => {
          let iterations = 0;
          let lastValue = null;
            // Reduced stepsPerTick
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
            if (value.type === 'found' || value.type === 'not_found') break;
            iterations++;
          }
          
          if (lastValue.type === 'visiting') {
            const allEdges = lastValue.visitedEdges;
            const filteredEdges = density === 1 ? allEdges : allEdges.filter((_, i) => i % density === 0);
            setVisitedEdges(filteredEdges);
            const currentElapsed = Date.now() - startTimeRef.current;
            const currentDistMeters = (lastValue.currentDistance || 0) * 1000;
            
            setStats(prev => ({ 
              ...prev, 
              edges: allEdges.length, 
              time: currentElapsed,
              distance: currentDistMeters 
            }));
            
            // Play subtle tick every ~50 edges
            if (allEdges.length % 50 === 0) playSearchTick();
            
            const delay = Math.max(1, 41 - speed);
            animationRef.current = setTimeout(step, delay);
          } else if (lastValue.type === 'found') {
            clearInterval(dotsIntervalRef.current);
            setProcessingDots('');
            const elapsed = Date.now() - startTimeRef.current;
            
            // Use precise distance calculated by algorithm
            let distance = lastValue.totalDistance * 1000;
            
            // Fallback calculation if missing (legacy)
            if (distance === undefined || distance === null) {
              distance = 0;
              for (let i = 0; i < lastValue.path.length - 1; i++) {
                distance += haversine(lastValue.path[i][0], lastValue.path[i][1], lastValue.path[i+1][0], lastValue.path[i+1][1]);
              }
              distance *= 1000;
            }

            setVisitedEdges(lastValue.visitedEdges);
            setFinalPath(lastValue.path);
            setStats({ edges: lastValue.visitedEdges.length, time: elapsed, distance: distance });
            setStatus('success');
            playSuccess();
            setIsRunning(false);
            // Auto stop recording if active
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              setTimeout(() => mediaRecorderRef.current.stop(), 1500);
            }
          } else {
            clearInterval(dotsIntervalRef.current);
            setProcessingDots('');
            setStatus('no_path');
            setIsRunning(false);
            // Auto stop recording if active
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              setTimeout(() => mediaRecorderRef.current.stop(), 1500);
            }
          }
        };
        
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
            playSuccess();
          } else {
            setStatus('no_path');
          }
          setIsRunning(false);
          clearInterval(dotsIntervalRef.current);
          setProcessingDots('');
        } else {
          step();
        }
      }, 100);
    }
  }, [countdown, graph, start, end, algorithm, speed, density, showVisualization]);
  
  const stopAlgorithm = useCallback(() => {
    if (animationRef.current) clearTimeout(animationRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    setProcessingDots('');
    setIsRunning(false);
    setCountdown(null);
  }, []);
  
  const resetAll = useCallback(() => {
    stopAlgorithm();
    setStart(city.start);
    setEnd(city.end);
    setShowMenu(true); // Restore menu on reset
    setVisitedEdges([]);
    setFinalPath([]);
    setStatus('idle');
    setStats({ edges: 0, time: 0, distance: 0 });
    setProcessingDots('');
    setCountdown(null);
    setMenuPanelPos(null);
    setScorePanelPos(null);
  }, [stopAlgorithm, city.start, city.end]);

  // Start recording with screen capture
  const startRecording = useCallback(async () => {
    try {
      // Request screen capture
      // Request screen capture with options to include current tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Allow user to choose Screen, Window, or Tab
        audio: true,
        selfBrowserSurface: 'include', // Allow current tab to be selected
        systemAudio: 'include' 
      });
      
      // Store stream for later - recording will start after countdown
      pendingStreamRef.current = stream;
      recordedChunksRef.current = [];
      
      // Start countdown (recording will start when countdown finishes)
      setCountdown(3);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  // Stop recording  
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Menu Drag Handlers
  const handleMenuPointerDown = (e) => {
    // Only allow left click
    if (e.button !== 0) return;
    e.stopPropagation(); // Prevent map drag
    
    const panel = e.currentTarget.closest('.draggable-panel');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    menuDragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setIsDraggingMenu(true);
    panel.setPointerCapture(e.pointerId);
  };

  const handleMenuPointerMove = (e) => {
    if (!isDraggingMenu) return;
    e.stopPropagation();
    
    setMenuPanelPos({
      left: `${e.clientX - menuDragOffset.current.x}px`,
      top: `${e.clientY - menuDragOffset.current.y}px`,
      bottom: 'auto',
      right: 'auto',
      transform: 'none'
    });
  };

  const handleMenuPointerUp = (e) => {
    if (!isDraggingMenu) return;
    e.stopPropagation();
    setIsDraggingMenu(false);
    e.currentTarget.closest('.draggable-panel')?.releasePointerCapture(e.pointerId);
  };

  // Score Panel Drag Handlers
  const handleScorePointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const panel = e.currentTarget.closest('.draggable-panel');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    scoreDragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setIsDraggingScore(true);
    panel.setPointerCapture(e.pointerId);
  };

  const handleScorePointerMove = (e) => {
    if (!isDraggingScore) return;
    e.stopPropagation();
    
    setScorePanelPos({
      left: `${e.clientX - scoreDragOffset.current.x}px`,
      top: `${e.clientY - scoreDragOffset.current.y}px`,
      bottom: 'auto',
      right: 'auto',
      transform: 'none'
    });
  };

  const handleScorePointerUp = (e) => {
    if (!isDraggingScore) return;
    e.stopPropagation();
    setIsDraggingScore(false);
    e.currentTarget.closest('.draggable-panel')?.releasePointerCapture(e.pointerId);
  };
  
  return (
    <div className="relative w-full h-screen">
      {/* Shorts Guide Overlay - 9:16 Letterbox */}
      {isShortsMode && (
        <div className="absolute inset-0 z-[1002] pointer-events-none flex justify-center">
          {/* Left Shadow - Solid Black for Theater Mode */}
          <div className="h-full bg-black flex-1"></div>
          
          {/* 9:16 Content Area Shell - Pure 9:16 Ratio */}
          <div 
            className="h-full border-x border-dashed border-white/40 relative shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            style={{ width: 'min(100vw, 100vh * 9/16)' }}
          >
            {/* Guide Corner Marks */}
            <div className="absolute top-4 left-4 border-t-2 border-l-2 border-white/50 w-4 h-4"></div>
            <div className="absolute top-4 right-4 border-t-2 border-r-2 border-white/50 w-4 h-4"></div>
            <div className="absolute bottom-4 left-4 border-l-2 border-b-2 border-white/50 w-4 h-4"></div>
            <div className="absolute bottom-4 right-4 border-r-2 border-b-2 border-white/50 w-4 h-4"></div>
            
            {/* Label */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black px-2 py-0.5 rounded text-[10px] text-white/70 font-mono border border-white/20">
              Shorts Theater Mode (9:16)
            </div>
          </div>
          
          {/* Right Shadow - Solid Black for Theater Mode */}
          <div className="h-full bg-black flex-1"></div>
        </div>
      )}

      {/* Control Panel - Hidden during running/recording/countdown, visible in idle and success */}
      {!recordMode && !isRunning && !countdown && !isRecording && showMenu && (
      <div 
        className={`draggable-panel absolute top-4 z-[1000] bg-gray-900/90 p-4 rounded-lg text-white backdrop-blur-sm border border-gray-700 max-w-xs transition-all duration-300 ${isDraggingMenu ? 'cursor-grabbing' : ''}`}
        style={menuPanelPos || (isShortsMode ? { 
          bottom: 'max(1rem, calc(50vh - (100vh * 9/16 / 2) + 12px))', 
          right: 'max(1rem, calc(50vw - (100vh * 9/16 / 2) + 12px))', 
          transform: 'none' 
        } : { 
          bottom: '2rem', 
          right: '1rem',
          transform: 'none'
        })}
        onPointerMove={handleMenuPointerMove}
        onPointerUp={handleMenuPointerUp}
      >
        <h2 
          className="text-xl font-bold mb-1 text-cyan-400 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleMenuPointerDown}
        >
          Path Finder
        </h2>
        
        {/* Hidden during running */}
        {!isRunning && !countdown && (
          <>
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
          </>
        )}

        {/* Current Algorithm Display - Always visible */}
        <div className="mb-3 p-2 bg-gray-800 rounded border border-cyan-500">
          <div className="text-lg font-bold text-yellow-400">{ALGORITHMS[algorithm].name}</div>
          {!isRunning && <div className="text-xs text-gray-400">{ALGORITHMS[algorithm].description}</div>}
        </div>
        
        {/* Hidden during running */}
        {!isRunning && !countdown && (
          <>
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
            
            {/* Sliders Group (Speed & Density) */}
            <div className="flex flex-col gap-3 mb-3 bg-gray-800/30 p-2 rounded border border-gray-700/50">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 flex justify-between">
                  <span>Speed</span>
                  <span className="text-cyan-400 font-mono text-[10px]">{speed}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 flex justify-between">
                  <span>Path Density</span>
                  <span className="text-cyan-400 font-mono text-[10px]">1/{density}</span>
                </label>
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
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="shortsToggle"
                  checked={isShortsMode} 
                  onChange={(e) => setIsShortsMode(e.target.checked)}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <label htmlFor="shortsToggle" className="text-xs text-purple-300 font-bold cursor-pointer">9:16 Shorts Mode</label>
              </div>
            </div>
            

          </>
        )}
        
        {/* Buttons - Only show when not running */}
        {!isRunning && !countdown && (
          <div className="flex gap-2">
            <button
              onClick={runAlgorithm}
              disabled={!start || !end || isLoading || countdown !== null}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded font-bold flex-1"
            >▶ Start</button>
            {isShortsMode && start && end && (
              <button
                onClick={() => {
                  setIsShortsMode(false);
                  setTimeout(() => setIsShortsMode(true), 10);
                }}
                title="Fit path into 9:16 area"
                className="px-3 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded"
              >🎯</button>
            )}
            <button
              onClick={resetAll}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
            >Reset</button>
          </div>
        )}
        
        <div className="mt-3">
          {isLoading && graph.ways.length === 0 && (
            <p className="text-yellow-400 text-sm">🔄 Loading road network...</p>
          )}
          {status === 'running' && (
            <p className="text-cyan-400 text-lg font-mono processing-text">
              Calculating{processingDots}
            </p>
          )}
          {status === 'success' && <p className="text-green-400 text-sm font-medium">✓ Complete</p>}
          {status === 'no_path' && <p className="text-red-400 text-sm">❌ No connected path found.</p>}
          {status === 'click_too_far' && <p className="text-orange-400 text-sm">⚠️ Too far from road. Click on blue lines!</p>}
          {status === 'error_loading' && <p className="text-red-500 text-sm">❌ Loading failed. Please retry.</p>}
          {!isLoading && graph.ways.length === 0 && <p className="text-orange-400 text-sm">⚠️ No road data in this area.</p>}
        </div>
        
        {/* Stats Panel - Always show when running or success */}

        
        {/* Retry Button */}
        {status === 'no_path' && (
          <button
            onClick={resetAll}
            className="mt-2 w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-bold"
          >🔄 Try Another Route</button>
        )}
        
        {/* Hidden during running */}
        {!isRunning && !countdown && (
          <>
            {/* Click Guide */}
            <p className="mt-3 text-xs text-blue-300">💡 Click on blue roads only</p>
            
            <div className="mt-2 text-xs text-gray-500">
              Roads: {graph.ways.length}
            </div>
            
            {/* Resize Hint for Shorts Mode */}
            {isShortsMode && (
              <p className="text-[10px] text-purple-200/90 mb-2 leading-tight bg-purple-900/60 p-1.5 rounded border border-purple-400/30">
                💡 **창이 더 안 줄어들면?** 창의 **높이**를 줄여보세요. 
                비율에 맞춰 너비도 함께 좁아집니다.
              </p>
            )}

            {/* Record Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={(isRunning || isLoading || countdown !== null) && !isRecording}
              className={`mt-3 w-full px-3 py-2 text-sm font-bold rounded ${countdown !== null ? 'bg-yellow-500' : isRecording ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-purple-600 hover:bg-purple-500'} text-white disabled:bg-gray-600`}
            >
              {countdown !== null ? `⏳ ${countdown}` : isRecording ? '⏹️ Stop Recording' : '🎬 Record & Start'}
            </button>
          </>
        )}
      </div>
      )}
      
      {/* Countdown Overlay - Large center display */}
      {countdown !== null && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center pointer-events-none">
          <div className="text-9xl font-black text-yellow-400 drop-shadow-2xl animate-pulse">
            {countdown}
          </div>
        </div>
      )}
      
      {/* Stats Overlay - Left side during running (same as control panel position) */}
      {/* Stats Overlay - Always visible per user request */}
      {/* Stats Overlay - Always visible per user request */}
      <div 
        className={`draggable-panel absolute top-4 z-[1001] bg-gray-900/90 p-4 rounded-lg text-white backdrop-blur-sm border border-gray-700 max-w-xs transition-all duration-300 ${isDraggingScore ? 'cursor-grabbing' : ''}`}
        style={scorePanelPos || (isShortsMode ? { 
          left: 'max(1rem, calc(50vw - (100vh * 9/16 / 2) + 12px))', 
          transform: 'none' 
        } : { left: '1rem' })}
        onPointerMove={handleScorePointerMove}
        onPointerUp={handleScorePointerUp}
      >
        <h2 
          className="text-xl font-bold mb-2 text-cyan-400 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleScorePointerDown}
        >
          Path Finder
        </h2>
        <div className="p-2 bg-gray-800 rounded border border-cyan-500 mb-3">
          <div className="text-lg font-bold text-yellow-400">{ALGORITHMS[algorithm].name}</div>
        </div>
        <div className="p-2 bg-gray-800 rounded text-sm border border-gray-700 space-y-1">
          <div className="flex justify-between"><span>Roads explored:</span><span className="text-cyan-400 font-bold">{stats.edges}</span></div>
          <div className="flex justify-between"><span>Time:</span><span className="text-green-400">{((stats.time || 0) / 1000).toFixed(1)}s</span></div>
          <div className="flex justify-between"><span>Distance:</span><span className="text-orange-400 font-bold">{(stats.distance || 0).toFixed(0)}m</span></div>
        </div>
        {status === 'success' && <div className="mt-2 text-green-400 text-sm font-medium text-center">✓ Path found</div>}
        {status === 'running' && <p className="mt-3 text-cyan-400 text-lg font-mono">Calculating{processingDots}</p>}
      </div>

      {/* Map with dimming effect */}
      <MapContainer 
        center={city.center} 
        zoom={13} 
        zoomControl={false}
        className={`w-full h-full ${isRunning ? 'map-dimmed' : 'map-normal'}`}
      >
        {/* Hide ZoomControl when running/recording/countdown, match menu behavior */}
        {!recordMode && !isRunning && !countdown && !isRecording && showMenu && (
          <ZoomControl position="topright" />
        )}
        <ChangeView center={city.center} isMapLocked={isMapLocked} isShortsMode={isShortsMode} city={city} />
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
          showMenu={showMenu}
          setShowMenu={setShowMenu}
        />
        
        {/* Boundary Box - Removed for cleaner recording */}
        
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
              opacity: 0.85,
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
