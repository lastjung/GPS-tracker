import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Rectangle, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { playBeep, playSuccess, playSearchTick } from '../utils/audio';
import { haversine, boundsFromPoints } from '../utils/physics';
import { CITIES } from '../constants/cities';
import { useRoadNetwork } from '../hooks/useRoadNetwork';
import { useAlgorithmRunner } from '../hooks/useAlgorithmRunner';
import { dijkstraOnGraph, astarOnGraph } from '../algorithms/pathfinding';
import { findNearestNode, findNearestNodeCoords } from '../utils/geo';

const algoFns = { astar: astarOnGraph, dijkstra: dijkstraOnGraph };
const ALGORITHMS = {
  astar: { name: 'A* Search', fn: astarOnGraph, description: 'Goal-directed heuristic search' },
  dijkstra: { name: 'Dijkstra', fn: dijkstraOnGraph, description: 'Uniform cost exploration' }
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
// Map click handler that snaps to nearest road (auto-toggle)
const MapClickHandler = ({ graph, waypoints, setWaypoints, setVisitedEdges, setFinalPath, setStatus, isRunning, showMenu, setShowMenu, city }) => {
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
        
        // Check if current waypoints are the default city ones
        // If so, replace them with the new click (Start user's own path)
        const isDefault = waypoints.length === 2 && 
                          city && 
                          waypoints[0].lat === city.start.lat && waypoints[0].lng === city.start.lng &&
                          waypoints[1].lat === city.end.lat && waypoints[1].lng === city.end.lng;

        if (isDefault) {
          setWaypoints([snapped]);
        } else {
          // Append new waypoint
          setWaypoints([...waypoints, snapped]);
        }
        
        // Reset path visualization when modifying points
        setVisitedEdges([]);
        setFinalPath([]);
      }
  });
  return null;
};



// Map flyTo logic when city changes - Enhanced to respect Shorts Mode padding
const ChangeView = ({ center, isMapLocked, isShortsMode, city, waypoints }) => {
  const map = useMap();
  const lastFitRef = useRef(0);
  
  const fitToRoute = useCallback(() => {
    // Fit to all waypoints
    if (!city || !waypoints || waypoints.length === 0) return;
    
    const latLngs = waypoints.map(p => [p.lat, p.lng]);
    const bounds = latLngs.length > 1 
      ? latLngs 
      : [[waypoints[0].lat, waypoints[0].lng], [waypoints[0].lat, waypoints[0].lng]]; // Single point fallback
    
    // Dynamic horizontal padding for Shorts Mode
    let hPadding = 50;
    if (isShortsMode) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const shortsWidth = viewportHeight * 9 / 16;
      hPadding = (viewportWidth - shortsWidth) / 2 + 20; 
    }

    // 0.6s Debounce / Lock for Shorts Mode to prevent double-zoom shaking
    const now = Date.now();
    if (isShortsMode && now - lastFitRef.current < 600) return;
    lastFitRef.current = now;

    map.flyToBounds(bounds, { 
      paddingBottomRight: [hPadding, 120],
      paddingTopLeft: [hPadding, 50],
      duration: isShortsMode ? 0 : 1.5,
      animate: !isShortsMode 
    });

    if (isShortsMode) {
      // Standard zoom boost for Shorts Mode
      setTimeout(() => {
        map.setZoom(map.getZoom() + 0.35);
      }, 50); 
    }
  }, [map, city, isShortsMode, waypoints]);

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

const RealMapVisualizer = () => {
  const [cityKey, setCityKey] = useState('dubai');
  const city = CITIES[cityKey];
  const [bounds, setBounds] = useState(null);
  const [delayedStart, setDelayedStart] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [recordMode, setRecordMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showMenu, setShowMenu] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState('Visualize');
  const [isMapLocked, setIsMapLocked] = useState(false);
  const [isShortsMode, setIsShortsMode] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);

  // Custom Hooks
  const { graph, setGraph, isLoading, error: networkError, setIsLoading, fetchRoadNetwork, buildGraph } = useRoadNetwork(bounds, cityKey);
  
  // Waypoints state (supports Multi-Path)
  const [waypoints, setWaypoints] = useState([city.start, city.end]);
  
  // Derived for hook compatibility (first and last)
  const start = waypoints[0];
  const end = waypoints.length > 1 ? waypoints[waypoints.length - 1] : null;

  const {
    isRunning,
    status,
    setStatus,
    stats,
    setStats,
    visitedEdges,
    setVisitedEdges,
    finalPath,
    setFinalPath,
    processingDots,
    setProcessingDots,
    speed,
    setSpeed,
    algorithm,
    setAlgorithm,
    density,
    setDensity,
    showVisualization,
    setShowVisualization,
    isTurboMode,
    setIsTurboMode,
    run: runAlgorithmCore,
    stop: stopAlgorithm,
    reset: resetAlgorithm
  } = useAlgorithmRunner(graph, start, end, {
    findNearestNode,
    haversine
  });

  const startTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const pendingStreamRef = useRef(null);
  const lastFitRef = useRef(0);
  const cityKeyRef = useRef(cityKey);

  useEffect(() => {
    cityKeyRef.current = cityKey;
  }, [cityKey]);

  useEffect(() => {
    if (networkError === 'error_loading') {
      setStatus('error_loading');
    } else if (status === 'error_loading' && !networkError) {
      setStatus('idle');
    }
  }, [networkError, status, setStatus]);
  
  // Drag state for Menu Panel
  const [menuPanelPos, setMenuPanelPos] = useState(null);
  const [isDraggingMenu, setIsDraggingMenu] = useState(false);
  const menuDragOffset = useRef({ x: 0, y: 0 });

  // Drag state for Score Panel
  const [scorePanelPos, setScorePanelPos] = useState(null);
  const [isDraggingScore, setIsDraggingScore] = useState(false);
  const scoreDragOffset = useRef({ x: 0, y: 0 });
  




  const handleCityChange = (key) => {
    stopAlgorithm();
    const newCity = CITIES[key];
    setCityKey(key);
    setShowMenu(true); 
    
    // Support predefined waypoints (e.g. San Francisco scenic route)
    if (newCity.waypoints) {
      setWaypoints(newCity.waypoints);
      
      // Calculate bounds covering all waypoints
      const lats = newCity.waypoints.map(p => p.lat);
      const lngs = newCity.waypoints.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      const padding = 0.02;
      setBounds({
        south: minLat - padding,
        north: maxLat + padding,
        west: minLng - padding,
        east: maxLng + padding
      });
    } else {
      setWaypoints([newCity.start, newCity.end]);
      // Slight zoom out for Moscow
      const padding = key === 'moscow' ? 0.03 : 0.01;
      setBounds(boundsFromPoints(newCity.start, newCity.end, padding));
    }
    
    // Default to A* for all cities
    setAlgorithm('astar');
    setSpeed(4);
    
    setGraph({ nodes: {}, edges: {}, ways: [] }); 
    setVisitedEdges([]);
    setFinalPath([]);
    setStatus('idle');
    setProcessingDots('');
  };

  useEffect(() => {
    if (!bounds) return; // Allow loading even if locked to get initial data
    

    // Prevent reloading if graph is already loaded for this area
    if (graph.ways.length > 0 && cityKey === cityKeyRef.current) {
      if (isLoading) setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    const load = async () => {
      const requestCity = cityKey; 
      setIsLoading(true);
      try {
        const data = await fetchRoadNetwork(bounds, controller.signal);
        
        // Final sanity check: if the city changed or unmounted, discard data
        if (!isMounted || cityKeyRef.current !== requestCity) {
           console.log(`Discarding stale data for ${requestCity}`);
           return;
        }

        const graphData = buildGraph(data);
        if (isMounted) {
          setGraph(graphData);
          if (status === 'error_loading') setStatus('idle');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (!isMounted) return;
        console.error('Failed to load roads:', err);
        setStatus('error_loading');
      } finally {
        if (isMounted && cityKeyRef.current === requestCity) {
          setIsLoading(false);
        }
      }
    };
    
    const timeout = setTimeout(load, 400); 
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [bounds, cityKey, graph.ways.length, setIsLoading, fetchRoadNetwork, buildGraph, setGraph, setStatus, status]);

  // Combined score update logic
  const updateRealTimeStats = useCallback((visitedEdges, currentDistance) => {
    const elapsed = Date.now() - startTimeRef.current;
    const distMeters = currentDistance !== undefined && currentDistance !== null && currentDistance !== 0
      ? currentDistance * 1000 
      : (visitedEdges.length * 0.05) * 1000; // Fallback to estimate if 0/missing
      
    setStats({
      edges: visitedEdges.length,
      time: Math.max(100, elapsed),
      distance: distMeters
    });
  }, [setStats]);
  
  // Refined run trigger
  const handleStart = useCallback(() => {
    if (waypoints.length < 2 || Object.keys(graph.nodes).length === 0) return;
    
    // If delayed start (for recording)
    if (delayedStart && countdown === null) {
      setCountdown(3);
      return;
    }

    runAlgorithmCore(algoFns, waypoints);
  }, [waypoints, graph, delayedStart, countdown, runAlgorithmCore]);

  // Move cleanup logic to a stable ref to avoid closure issues in the countdown effect
  const onStopCallback = useCallback(() => {
    if (recordedChunksRef.current.length > 0) {
      // Use the actual mimeType used by the recorder, or fallback to default
      const mimeType = mediaRecorderRef.current?.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Determine extension based on mimeType
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      a.download = `gps-tracker-${Date.now()}.${ext}`;
      document.body.appendChild(a); // Append to body to ensure click works in some browsers
      a.click();
      document.body.removeChild(a); // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    setIsRecording(false);
    pendingStreamRef.current = null;
  }, [setIsRecording]);

  // Countdown effect to trigger run
  useEffect(() => {
    if (countdown === 0) {
      setCountdown(null);
      if (pendingStreamRef.current) {
        setIsRecording(true);
        const stream = pendingStreamRef.current;
        
        // Robust mimeType selection for Mac/Windows compatibility
        const mimeTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4' // For Safari mostly
        ];
        
        const selectedMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
        
        if (!selectedMime) {
          console.error('No supported video mimeType found for MediaRecorder');
          alert('Screen recording is not supported in this browser.');
          return;
        }

        console.log(`Starting recording with mimeType: ${selectedMime}`);

        const recorder = new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 5000000 // 5Mbps
        });
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          onStopCallback();
        };

        recorder.start(100); // Collect data every 100ms
        setTimeout(() => setIsPreparing(false), 200);
      } else {
        setIsPreparing(false);
      }
      runAlgorithmCore(algoFns, waypoints);
    } else if (countdown !== null && countdown > 0) {
      playBeep(880 + (3 - countdown) * 220);
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, runAlgorithmCore, setIsRecording, onStopCallback, waypoints]);

  // Stop recording  
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Start recording with screen capture
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include' 
      });
      pendingStreamRef.current = stream;
      recordedChunksRef.current = [];
      setIsPreparing(true);
      setCountdown(3);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  // Auto-stop recording 1.5s after algorithm success
  useEffect(() => {
    if (isRecording && status === 'success') {
      const timer = setTimeout(() => {
        stopRecording();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isRecording, status, stopRecording]);

  
  
  const resetAll = useCallback(() => {
    stopAlgorithm();
    resetAlgorithm();
    setWaypoints([city.start, city.end]);
    setShowMenu(true); // Restore menu on reset
    setCountdown(null);
    setMenuPanelPos(null);
    setScorePanelPos(null);
  }, [stopAlgorithm, resetAlgorithm, city.start, city.end]);


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
        <div className="absolute inset-0 z-[1003] pointer-events-none flex justify-center">
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

      {/* Control Panel - Hidden during running/recording/countdown/preparing, visible in idle and success */}
      {!recordMode && !isRunning && !countdown && !isRecording && !isPreparing && showMenu && (
      <div 
        className={`draggable-panel absolute z-[1001] bg-gray-900/90 p-4 rounded-lg text-white backdrop-blur-sm border border-gray-700 w-[calc(100%-2rem)] max-w-[320px] transition-all duration-300 ${isDraggingMenu ? 'cursor-grabbing' : ''}`}
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
        <div className="flex justify-between items-center mb-2">
          <h2 
            className="text-xl font-bold text-cyan-400 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handleMenuPointerDown}
          >
            Path Finder
          </h2>
          <button 
            onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 transition-colors"
            title={isMenuCollapsed ? "Expand" : "Shrink"}
          >
            {isMenuCollapsed ? '🔼' : '🔽'}
          </button>
        </div>
        
        {/* Settings Content - Always Visible when not collapsed */}
        {!isRunning && !countdown && !isMenuCollapsed && (
          <div className="overflow-hidden">
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
            
            {/* Coordinates Display - Multi-waypoint aware */}
            <div className="flex flex-col gap-1 mb-3 bg-gray-900/50 p-2 rounded border border-gray-700/50 font-mono text-[10px]">
              {waypoints.map((pt, idx) => (
                <div key={idx} className="flex justify-between">
                  <span style={{ color: idx === 0 ? '#4ade80' : idx === waypoints.length - 1 ? '#f87171' : '#60a5fa' }}>
                    {idx === 0 ? 'Start (S)' : idx === waypoints.length - 1 ? 'End (E)' : `Point ${idx}`}
                  </span>
                  <span className="text-gray-300">{`${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`}</span>
                </div>
              ))}
              {waypoints.length === 0 && <span className="text-gray-500 italic">Click map to add points</span>}
            </div>

            {/* Mode Toggle */}
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
                  type="range" min="1" max="50" value={speed}
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
                  type="range" min="1" max="10" value={density}
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
                  type="checkbox" id="vizToggle" checked={showVisualization} 
                  onChange={(e) => setShowVisualization(e.target.checked)}
                  disabled={isRunning} className="w-4 h-4 rounded accent-cyan-500"
                />
                <label htmlFor="vizToggle" className="text-xs text-gray-300 cursor-pointer">Show Steps</label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" id="lockToggle" checked={isMapLocked} 
                  onChange={(e) => setIsMapLocked(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-500"
                />
                <label htmlFor="lockToggle" className="text-xs text-orange-300 font-bold cursor-pointer">Lock Map View</label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" id="shortsToggle" checked={isShortsMode} 
                  onChange={(e) => setIsShortsMode(e.target.checked)}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <label htmlFor="shortsToggle" className="text-xs text-purple-300 font-bold cursor-pointer">9:16 Shorts Mode</label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" id="turboToggle" checked={isTurboMode} 
                  onChange={(e) => setIsTurboMode(e.target.checked)}
                  className="w-4 h-4 rounded accent-yellow-500"
                />
                <label htmlFor="turboToggle" className="text-xs text-yellow-300 font-bold cursor-pointer">Tube Mode (Acceleration)</label>
              </div>
            </div>
          </div>
        )}

        {/* Current Algorithm Name & Description - Always visible status when not collapsed */}
        {!isMenuCollapsed && (
          <div className="mb-3 p-2 bg-gray-800 rounded border border-cyan-500">
            <div className="text-md font-bold text-yellow-400 flex justify-between items-center">
              {ALGORITHMS[algorithm].name}
            </div>
            {!isRunning && <div className="text-[10px] text-gray-400 mt-1">{ALGORITHMS[algorithm].description}</div>}
          </div>
        )}
        
        {/* Grouped Action Area - Hidden when collapsed */}
        {!isRunning && !countdown && !isMenuCollapsed && (
          <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700 shadow-inner">
            <p className={`text-[10px] text-center italic ${status === 'success' ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
              {waypoints.length < 2 ? 'Add at least 2 points' : status === 'success' ? '✓ Complete' : `Ready: ${waypoints.length} points`}
            </p>
            
            <div className="flex gap-2 items-stretch">
              <button
                onClick={handleStart}
                disabled={waypoints.length < 2 || isLoading || countdown !== null}
                className={`h-8 rounded-lg font-bold flex-[2] text-xs text-white transition-all duration-300 transform active:scale-95 shadow-lg ${
                  waypoints.length < 2 || isLoading || graph.ways.length === 0
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' 
                    : 'bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-300 hover:to-teal-500 shadow-emerald-900/40 hover:shadow-emerald-500/50'
                }`}
              >
                {waypoints.length < 2 ? 'Select Points' : (isLoading || graph.ways.length === 0 ? 'Wait' : 'Start')}
              </button>
              
              <button
                onClick={() => setWaypoints([])}
                className="px-2 h-8 bg-red-800/50 hover:bg-red-700 text-gray-300 rounded-lg shadow-md font-bold text-xs transition-all border border-red-900 active:scale-95"
                title="Clear all points"
              >Clear</button>
              
              <button
                onClick={resetAll}
                className="px-4 h-8 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg shadow-md font-bold text-xs transition-all border border-gray-600 active:scale-95"
              >Reset</button>

              {isShortsMode && waypoints.length >= 2 && (
                <button
                  onClick={() => {
                    setIsShortsMode(false);
                    setTimeout(() => setIsShortsMode(true), 10);
                  }}
                  title="Fit path into 9:16 area"
                  className="px-4 h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg transition-all active:scale-95"
                >🎯</button>
              )}
            </div>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={(isRunning || isLoading || countdown !== null) && !isRecording}
              className={`w-full h-8 text-[11px] font-black rounded-lg transition-all shadow-xl active:scale-[0.98] ${
                countdown !== null ? 'bg-amber-500' : isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600 shadow-purple-900/30'
              } text-white disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
            >
              {countdown !== null ? `⏳ ${countdown}` : isRecording ? 'STOP REC' : 'REC & START'}
            </button>
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
          {status === 'no_path' && <p className="text-red-400 text-sm">❌ No connected path found.</p>}
          {status === 'click_too_far' && <p className="text-orange-400 text-sm">⚠️ Too far from road. Click on blue lines!</p>}
          {status === 'error_loading' && <p className="text-red-500 text-sm">❌ Loading failed. Please retry.</p>}
          {!isLoading && status !== 'error_loading' && graph.ways.length === 0 && (
            <p className="text-orange-400 text-sm">⚠️ No road data in this area.</p>
          )}
        </div>
        
        {/* Stats Panel - Always show when running or success */}

        
        {/* Retry Button */}
        {status === 'no_path' && (
          <button
            onClick={resetAll}
            className="mt-2 w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-bold"
          >🔄 Try Another Route</button>
        )}
        
        {!isRunning && !countdown && (
          <div className="mt-3 flex flex-col gap-2">
            {isShortsMode && (
              <p className="text-[10px] text-purple-200/90 leading-tight bg-purple-900/60 p-2 rounded border border-purple-400/30">
                💡 **화면에 딱 맞게 녹화하려면?** 브라우저 창의 **높이를 위아래로 더 길게 늘리세요.** 
                그러면 너비 제한 없이 9:16 비율을 맞출 수 있습니다.
              </p>
            )}
            <div className="px-1 flex justify-between items-center text-[10px]">
              <span className="text-blue-300 opacity-80">💡 Click blue roads for path</span>
              <span className="text-gray-500 font-mono">
                Roads: {graph.ways.length.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
      )}
      
      {/* Countdown Overlay - Large center display */}
      {countdown !== null && (
        <div className="absolute inset-0 z-[1002] flex items-center justify-center pointer-events-none">
          <div className="text-9xl font-black text-yellow-400 drop-shadow-2xl animate-pulse">
            {countdown}
          </div>
        </div>
      )}
      
      {/* Stats Overlay - Left side during running (same as control panel position) */}
      {/* Stats Overlay - Always visible per user request */}
      {/* Stats Overlay - Always visible per user request */}
      <div 
        className={`draggable-panel absolute top-4 z-[1000] bg-gray-900/90 p-4 rounded-lg text-white backdrop-blur-sm border border-gray-700 w-[calc(100%-2rem)] max-w-[280px] transition-all duration-300 ${isDraggingScore ? 'cursor-grabbing' : ''}`}
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
          {city.name.split(' (')[0]}
        </h2>
        <div className="p-2 bg-gray-800 rounded border border-cyan-500 mb-3">
          <div className="text-lg font-bold text-yellow-400">{ALGORITHMS[algorithm].name}</div>
        </div>
        <div className="p-2 bg-gray-800 rounded text-sm border border-gray-700 space-y-1">
          <div className="flex justify-between"><span>Roads explored:</span><span className="text-cyan-400 font-bold">{stats.edges}</span></div>
          <div className="flex justify-between"><span>Time:</span><span className="text-green-400">{((stats.time || 0) / 1000).toFixed(3)}s</span></div>
          <div className="flex justify-between"><span>Distance:</span><span className="text-orange-400 font-bold">{(stats.distance || 0).toFixed(0)}m</span></div>
        </div>
        {status === 'success' && <div className="mt-2 text-green-400 text-sm font-medium text-center">✓ Path found</div>}
        {status === 'running' && <p className="mt-3 text-cyan-400 text-lg font-mono">Calculating{processingDots}</p>}
      </div>

      {/* Map with dimming effect - Key ensures total re-render on city change */}
      <MapContainer 
        key={cityKey}
        center={city.center} 
        zoom={13} 
        zoomControl={false}
        preferCanvas={true}
        className={`w-full h-full ${isRunning ? 'map-dimmed' : 'map-normal'}`}
      >
        {/* Hide ZoomControl when running/recording/countdown, match menu behavior */}
        {!recordMode && !isRunning && !countdown && !isRecording && showMenu && (
          <ZoomControl position="topright" />
        )}
        <ChangeView center={city.center} isMapLocked={isMapLocked} isShortsMode={isShortsMode} city={city} waypoints={waypoints} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <RoadLoader setBounds={setBounds} isMapLocked={isMapLocked} />
        <MapClickHandler
          graph={graph}
          waypoints={waypoints}
          setWaypoints={setWaypoints}
          setVisitedEdges={setVisitedEdges}
          setFinalPath={setFinalPath}
          setStatus={setStatus}
          isRunning={isRunning}
          showMenu={showMenu}
          setShowMenu={setShowMenu}
          city={city}
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
        
        {/* Start/End/Waypoints markers */}
        {/* Start/End/Waypoints markers */}
        {waypoints.map((pt, i) => (
           <CircleMarker 
             key={i} 
             center={pt} 
             radius={8} 
             fillColor={i === 0 ? "#22c55e" : "#ef4444"} 
             fillOpacity={1} 
             color="#fff" 
             weight={2} 
           />
        ))}
      </MapContainer>
    </div>
  );
};

export default RealMapVisualizer;
