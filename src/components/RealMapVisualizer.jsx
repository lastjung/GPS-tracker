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
  const [start, setStart] = useState(city.start);
  const [end, setEnd] = useState(city.end);

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
    setShowMenu(true); 
    setStart(newCity.start);
    setEnd(newCity.end);
    
    // Slight zoom out for Moscow
    const padding = key === 'moscow' ? 0.03 : 0.01;
    setBounds(boundsFromPoints(newCity.start, newCity.end, padding));
    
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
    if (!start || !end || Object.keys(graph.nodes).length === 0) return;
    
    // If delayed start (for recording)
    if (delayedStart && countdown === null) {
      setCountdown(3);
      return;
    }

    runAlgorithmCore(algoFns);
  }, [start, end, graph, delayedStart, countdown, runAlgorithmCore]);

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
      runAlgorithmCore(algoFns);
    } else if (countdown !== null && countdown > 0) {
      playBeep(880 + (3 - countdown) * 220);
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, runAlgorithmCore, setIsRecording, onStopCallback]);

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
    setStart(city.start);
    setEnd(city.end);
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
            
            {/* Coordinates Display */}
            <div className="flex flex-col gap-1 mb-3 bg-gray-900/50 p-2 rounded border border-gray-700/50 font-mono text-[10px]">
              <div className="flex justify-between text-green-400">
                <span>Start (S):</span>
                <span>{start ? `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}` : 'Not Set'}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>End (E):</span>
                <span>{end ? `${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}` : 'Not Set'}</span>
              </div>
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
              {!start ? 'Set START on map' : !end ? 'Set END on map' : status === 'success' ? '✓ Complete' : 'Ready to Navigate'}
            </p>
            
            <div className="flex gap-2 items-stretch">
              <button
                onClick={handleStart}
                disabled={!start || !end || isLoading || countdown !== null}
                className={`h-8 rounded-lg font-bold flex-[2] text-xs text-white transition-all duration-300 transform active:scale-95 shadow-lg ${
                  !start || !end || isLoading || graph.ways.length === 0
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' 
                    : 'bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-300 hover:to-teal-500 shadow-emerald-900/40 hover:shadow-emerald-500/50'
                }`}
              >
                {!start || !end ? 'Select' : (isLoading || graph.ways.length === 0 ? 'Wait' : 'Start')}
              </button>
              
              <button
                onClick={resetAll}
                className="px-4 h-8 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg shadow-md font-bold text-xs transition-all border border-gray-600 active:scale-95"
              >Reset</button>

              {isShortsMode && start && end && (
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
