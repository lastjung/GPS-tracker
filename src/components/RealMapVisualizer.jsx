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
    // Proactive bounds update for road loading
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
    
    map.on('move', updateBounds);
    map.on('moveend', updateBounds);
    map.on('zoomend', updateBounds);
    
    updateBounds();
    
    return () => {
      map.off('move', updateBounds);
      map.off('moveend', updateBounds);
      map.off('zoomend', updateBounds);
    };
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
        
        const isDefault = waypoints.length === 2 && 
                          city && 
                          waypoints[0].lat === city.start.lat && waypoints[0].lng === city.start.lng &&
                          waypoints[1].lat === city.end.lat && waypoints[1].lng === city.end.lng;

        // Extract road name from graph if available
        const id = snapped.id;
        const roadName = graph.nodeNames?.[id] || `Waypoint ${isDefault ? 1 : waypoints.length + 1}`;
        const newPoint = { ...snapped, name: roadName };

        if (isDefault) {
          setWaypoints([newPoint]);
        } else {
          // Append new waypoint
          setWaypoints([...waypoints, newPoint]);
        }
        
        // Reset path visualization when modifying points
        setVisitedEdges([]);
        setFinalPath([]);
      }
  });
  return null;
};



// Map flyTo logic when city changes - Enhanced to respect Shorts Mode padding
const ChangeView = ({ center, isMapLocked, isShortsMode, city, waypoints, isRunning, isSuccessZooming }) => {
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
    if (isRunning || isSuccessZooming || waypoints?.length > 2) return; // Don't fit to route overview while running, zooming out after success, or if custom waypoints exist
    if (!center) return;
    // Only auto-fit when the city changes or when requested (via resetting lastFitRef or similar)
    // We remove fitToRoute from dependencies to stop it from moving every time waypoints change
    const now = Date.now();
    const delay = isShortsMode ? 250 : 0;
    const timer = setTimeout(fitToRoute, delay);
    return () => clearTimeout(timer);
  }, [center, isShortsMode, isRunning, isSuccessZooming, waypoints]); // Removed fitToRoute to prevent waypoint-triggered movement

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

// Component to automatically zoom into the current segment
const SegmentCameraView = ({ isRunning, currentSegmentIdx, waypoints, isShortsMode, isAutoFollow, setBounds }) => {
  const map = useMap();
  const lastSegmentRef = useRef(-1);
  const startTimeRef = useRef(null);

  // Track start time for the cinematic 2s delay
  useEffect(() => {
    if (isRunning) startTimeRef.current = Date.now();
    else startTimeRef.current = null;
  }, [isRunning]);

  useEffect(() => {
    if (!isAutoFollow || !isRunning || !waypoints || waypoints.length < 2) {
      lastSegmentRef.current = -1;
      return;
    }

    // CINEMATIC DELAY: Wait 2 seconds before starting auto-follow zoom
    if (startTimeRef.current && (Date.now() - startTimeRef.current < 2000)) return;

    if (currentSegmentIdx === lastSegmentRef.current) return;
    lastSegmentRef.current = currentSegmentIdx;

    const start = waypoints[currentSegmentIdx];
    const end = waypoints[currentSegmentIdx + 1];
    if (!start || !end) return;

    // Calculate bounds for this specific segment
    const bounds = [[start.lat, start.lng], [end.lat, end.lng]];
    
    // Horizontal padding for Shorts Mode
    let hPadding = 60;
    if (isShortsMode) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const shortsWidth = viewportHeight * 9 / 16;
      hPadding = (viewportWidth - shortsWidth) / 2 + 30; 
    }

    // Zoom and fix on this segment with a reasonable maxZoom
    map.flyToBounds(bounds, { 
      paddingBottomRight: [hPadding, 150],
      paddingTopLeft: [hPadding, 80],
      duration: 1.5,
      maxZoom: 16.5, // Slightly lower to avoid tile missing issues
      easeLinearity: 0.25
    });

    // Proactively trigger road loading for the target area
    const b = L.latLngBounds(bounds);
    setTimeout(() => {
      setBounds({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast()
      });
      map.invalidateSize(); // Fix rendering glitches
    }, 100);

  }, [isRunning, currentSegmentIdx, waypoints, isShortsMode, isAutoFollow, map, setBounds]);

  return null;
};

// Component to return to overview after search success
const ResultOverviewHandler = ({ status, waypoints, isShortsMode, setIsSuccessZooming }) => {
  const map = useMap();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (status === 'success' && !triggeredRef.current && waypoints && waypoints.length >= 2) {
      triggeredRef.current = true;
      setIsSuccessZooming(true); // Hide menu

      const timer = setTimeout(() => {
        const bounds = L.latLngBounds(waypoints.map(p => [p.lat, p.lng]));
        
        let hPadding = 60;
        if (isShortsMode) {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const shortsWidth = viewportHeight * 9 / 16;
          hPadding = (viewportWidth - shortsWidth) / 2 + 50;
        }

        map.flyToBounds(bounds, {
          paddingBottomRight: [hPadding, 100],
          paddingTopLeft: [hPadding, 100],
          duration: 2,
          easeLinearity: 0.25
        });

        // Show menu after zoom completes (duration 2s + extra buffer for review)
        setTimeout(() => {
          setIsSuccessZooming(false);
        }, 4500);

      }, 4000); // Wait 4s after arrival before zooming out
      
      return () => clearTimeout(timer);
    }
    
    if (status !== 'success') {
      triggeredRef.current = false;
      setIsSuccessZooming(false);
    }
  }, [status, waypoints, isShortsMode, map, setIsSuccessZooming]);

  return null;
};

const RealMapVisualizer = () => {
  const [cityKey, setCityKey] = useState('dc');
  const city = CITIES[cityKey];
  const [isSuccessZooming, setIsSuccessZooming] = useState(false);
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
  
  // ESC key handler for exit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsShortsMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
  const [mapStyle, setMapStyle] = useState('street');
  const [isAutoFollow, setIsAutoFollow] = useState(false);

  const MAP_STYLES = {
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    street: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  };

  // Custom Hooks
  const { graph, setGraph, isLoading, error: networkError, setIsLoading, fetchRoadNetwork, buildGraph } = useRoadNetwork(bounds, cityKey);
  
  // Waypoints state (supports Multi-Path)
  const [waypoints, setWaypoints] = useState(city.waypoints || [city.start, city.end]);
  
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
    currentDestName,
    setCurrentDestName,
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
    failedSegment,
    currentPos,
    currentSegmentIdx,
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

  // Sync HUD name with current context (Setup vs Running vs Success)
  useEffect(() => {
    if (!isRunning) {
      if (status === 'success') {
        setCurrentDestName('ARRIVED');
      } else if (waypoints.length >= 2) {
        setCurrentDestName(waypoints[1].name || 'Waypoint 1');
      } else {
        setCurrentDestName(null);
      }
    }
  }, [isRunning, status, waypoints, setCurrentDestName]);

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

  // Global ESC key listener to abort algorithm
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isRunning) {
        stopAlgorithm();
        setStatus('idle');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, stopAlgorithm, setStatus]);
  
  // Drag state for Menu Panel
  const [menuPanelPos, setMenuPanelPos] = useState(null);
  const [isDraggingMenu, setIsDraggingMenu] = useState(false);
  const menuDragOffset = useRef({ x: 0, y: 0 });

  // Drag state for Score Panel
  const [scorePanelPos, setScorePanelPos] = useState(null);
  const [isDraggingScore, setIsDraggingScore] = useState(false);
  const scoreDragOffset = useRef({ x: 0, y: 0 });
  
  // Drag state for HUD Panel
  const [hudPanelPos, setHudPanelPos] = useState(null);
  const [isDraggingHud, setIsDraggingHud] = useState(false);
  const hudDragOffset = useRef({ x: 0, y: 0 });
  




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
      
      // Vancouver needs extra padding, Gwanghwamun needs VERY LITTLE padding to stay focused
      const padding = (key === 'milan' || key === 'vancouver') ? 0.07 : (key === 'gwanghwamun' ? 0.03 : 0.04); 
      setBounds({
        south: minLat - padding,
        north: maxLat + padding,
        west: minLng - padding,
        east: maxLng + padding
      });
    } else {
      setWaypoints([newCity.start, newCity.end]);
      // Slight zoom out for Moscow
      const padding = 0.03; // Increased padding for better connectivity
      setBounds(boundsFromPoints(newCity.start, newCity.end, padding));
    }
    
    // Default to A* for all cities
    setAlgorithm('astar');
    setSpeed(15);
    
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
    
    // Start immediately unless in Record Mode
    if (recordMode && countdown === null) {
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
      setIsPreparing(false); 
      
      // IMMEDIATE START: Prioritize calculation to eliminate any visual lag
      runAlgorithmCore(algoFns, waypoints);

      if (pendingStreamRef.current) {
        setIsRecording(true);
        const stream = pendingStreamRef.current;
        
        // Robust mimeType selection for Mac/Windows compatibility
        const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        const selectedMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
        
        if (selectedMime) {
          const recorder = new MediaRecorder(stream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 5000000 
          });
          mediaRecorderRef.current = recorder;
          
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          
          recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            onStopCallback();
          };

          recorder.start(100); 
        }
      }
      
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
      setCountdown(3);
    } catch (err) {
      // Failed to start recording
    }
  }, []);

  // Auto-stop recording 1.5s after algorithm success
  useEffect(() => {
    if (isRecording && status === 'success') {
      const timer = setTimeout(() => {
        stopRecording();
      }, 12000); // 12s delay to capture successful overview recovery
      return () => clearTimeout(timer);
    }
  }, [isRecording, status, stopRecording]);

  
  
  const resetAll = useCallback(() => {
    stopAlgorithm();
    resetAlgorithm();
    setWaypoints(city.waypoints || [city.start, city.end]);
    setShowMenu(true); // Restore menu on reset
    setCountdown(null);
    setMenuPanelPos(null);
    setScorePanelPos(null);
    setHudPanelPos(null);
  }, [stopAlgorithm, resetAlgorithm, city]);


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

  // HUD Panel Drag Handlers
  const handleHudPointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const panel = e.currentTarget.closest('.draggable-panel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    hudDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDraggingHud(true);
    panel.setPointerCapture(e.pointerId);
  };

  const handleHudPointerMove = (e) => {
    if (!isDraggingHud) return;
    e.stopPropagation();
    setHudPanelPos({
      left: `${e.clientX - hudDragOffset.current.x}px`,
      top: `${e.clientY - hudDragOffset.current.y}px`,
      bottom: 'auto',
      right: 'auto',
      transform: 'none'
    });
  };

  const handleHudPointerUp = (e) => {
    if (!isDraggingHud) return;
    e.stopPropagation();
    setIsDraggingHud(false);
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
      {!recordMode && !isRunning && !countdown && !isRecording && !isPreparing && !isSuccessZooming && showMenu && (
      <div 
        className={`draggable-panel absolute z-[1001] bg-gray-900/95 p-3.5 rounded-xl text-white backdrop-blur-md border border-gray-700 w-[calc(100%-2rem)] max-w-[280px] max-h-[85vh] flex flex-col transition-all duration-300 shadow-2xl ${isDraggingMenu ? 'cursor-grabbing' : ''}`}
        style={menuPanelPos || (isShortsMode ? { 
          bottom: 'max(0.5rem, calc(50vh - (100vh * 9/16 / 2) + 8px))', 
          right: 'max(0.5rem, calc(50vw - (100vh * 9/16 / 2) + 8px))', 
          transform: 'none' 
        } : { 
          bottom: '1rem', 
          right: '1rem',
          transform: 'none'
        })}
        onPointerMove={handleMenuPointerMove}
        onPointerUp={handleMenuPointerUp}
      >
        <div className="flex justify-between items-center mb-1 border-b border-cyan-500/30 pb-1">
          <div 
            className="flex flex-col cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handleMenuPointerDown}
          >
            <h1 className="text-[10px] font-black tracking-[0.2em] text-cyan-400 leading-none mb-1">
              {cityKey === 'gwanghwamun' ? 'BTS LIVE STAGE' : 'ELITE PATH PASS'}
            </h1>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-black text-white">{city.name}</h2>
              <span className="text-[10px] font-mono text-yellow-400 bg-yellow-400/20 px-1.5 py-0.5 rounded border border-yellow-400/30">
                {ALGORITHMS[algorithm].name.replace(' Search', '')}
              </span>
            </div>
          </div>
          <button 
            onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 transition-colors scale-75"
            title={isMenuCollapsed ? "Expand" : "Shrink"}
          >
            {isMenuCollapsed ? '🔼' : '🔽'}
          </button>
        </div>
        
        {/* Settings Content - Always Visible when not collapsed */}
        {!isRunning && !countdown && !isMenuCollapsed && (
          <div className="overflow-y-auto pr-1 custom-scrollbar">
            {/* City Selector */}
            <div className="flex flex-col gap-1 mb-1.5">
              <select
                value={cityKey}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={isRunning}
                className="bg-gray-800 text-white px-2 py-2 rounded-lg w-full border border-gray-700 focus:border-cyan-500 outline-none text-xs font-medium shadow-inner"
              >
                {Object.entries(CITIES).map(([key, c]) => (
                  <option key={key} value={key}>{c.name}</option>
                ))}
              </select>
            </div>
            
            {/* Coordinates Display - Multi-waypoint aware */}
            <div className="flex flex-col gap-1 mb-3 bg-gray-950/60 p-2.5 rounded-lg border border-gray-800 font-mono text-[10px] max-h-32 overflow-y-auto custom-scrollbar shadow-inner">
              {waypoints.map((pt, idx) => (
                <div 
                  key={idx} 
                  className="flex justify-between items-center cursor-pointer hover:bg-white/5 px-1 py-0.5 rounded transition-colors group"
                  onDoubleClick={() => {
                    if (isRunning) return;
                    const newPts = [...waypoints];
                    newPts.splice(idx, 1);
                    setWaypoints(newPts);
                    setVisitedEdges([]);
                    setFinalPath([]);
                    setStatus('idle');
                  }}
                  title="Double click to remove"
                >
                  <span className="font-bold whitespace-nowrap" style={{ color: idx === 0 ? '#4ade80' : idx === waypoints.length - 1 ? '#f87171' : '#60a5fa' }}>
                    {idx === 0 ? 'START' : idx === waypoints.length - 1 ? 'END' : `WAY ${idx}`}
                  </span>
                  <span className="text-gray-300 truncate ml-2 text-right w-full" title={pt.name || `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`}>
                    {pt.name || `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`}
                  </span>
                </div>
              ))}
              {waypoints.length === 0 && <span className="text-gray-500 italic">Click map to add points</span>}
            </div>

            {/* Mode Toggle */}
            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-[11px] font-bold text-gray-400 tracking-wider">VIEW MODE</label>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                <button 
                  className={`flex-1 text-[11px] py-1.5 rounded-md font-bold transition-all ${displayMode === 'Visualize' ? 'bg-cyan-600 shadow-lg' : 'hover:bg-gray-800 text-gray-400'}`}
                  onClick={() => setDisplayMode('Visualize')}
                >Visualize</button>
                <button 
                  className={`flex-1 text-[11px] py-1.5 rounded-md font-bold transition-all ${displayMode === 'Route' ? 'bg-cyan-600 shadow-lg' : 'hover:bg-gray-800 text-gray-400'}`}
                  onClick={() => setDisplayMode('Route')}
                >Route</button>
              </div>
            </div>

            {/* Algorithm Selector */}
            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Algorithm</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                disabled={isRunning}
                className="bg-gray-800 text-white px-2 py-2 rounded-lg w-full border border-gray-700 outline-none text-xs font-medium"
              >
                {Object.entries(ALGORITHMS).map(([key, { name }]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>
            
            {/* Sliders Group (Speed & Density) */}
            <div className="flex flex-col gap-2.5 mb-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-800">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 flex justify-between tracking-wider">
                  <span>STEP SPEED</span>
                  <span className="text-cyan-400 font-mono bg-cyan-400/10 px-1.5 rounded">{speed}</span>
                </label>
                <input
                  type="range" min="1" max="50" value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 flex justify-between tracking-wider">
                  <span>DENSITY</span>
                  <span className="text-cyan-400 font-mono bg-cyan-400/10 px-1.5 rounded">1/{density}</span>
                </label>
                <input
                  type="range" min="1" max="10" value={density}
                  onChange={(e) => setDensity(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>

            {/* Visualization & View Controls */}
            <div className="grid grid-cols-2 gap-2 mb-3 bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" id="vizToggle" checked={showVisualization} 
                  onChange={(e) => setShowVisualization(e.target.checked)}
                  disabled={isRunning} className="w-3.5 h-3.5 rounded accent-cyan-500"
                />
                <label htmlFor="vizToggle" className="text-[10px] font-medium text-gray-300 cursor-pointer">Steps</label>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" id="lockToggle" checked={isMapLocked} 
                  onChange={(e) => setIsMapLocked(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-orange-500"
                />
                <label htmlFor="lockToggle" className="text-[10px] text-orange-400 font-bold cursor-pointer">Lock</label>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" id="shortsToggle" checked={isShortsMode} 
                  onChange={(e) => setIsShortsMode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-500"
                />
                <label htmlFor="shortsToggle" className="text-[10px] text-purple-400 font-bold cursor-pointer">Shorts</label>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" id="turboToggle" checked={isTurboMode} 
                  onChange={(e) => setIsTurboMode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-yellow-500"
                />
                <label htmlFor="turboToggle" className="text-[10px] text-yellow-500 font-black cursor-pointer italic">TURBO</label>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" id="autoFollowToggle" checked={isAutoFollow} 
                  onChange={(e) => setIsAutoFollow(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-cyan-400"
                />
                <label htmlFor="autoFollowToggle" className="text-[10px] text-cyan-400 font-bold cursor-pointer">CAM</label>
              </div>
            </div>
            
            {/* Map Style Selector */}
            <div className="flex flex-col gap-1 mb-1">
              <label className="text-[10px] font-bold text-gray-400 tracking-wider">MAP STYLE</label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.keys(MAP_STYLES).map((style) => (
                  <button
                    key={style}
                    onClick={() => setMapStyle(style)}
                    className={`text-[9px] py-1 rounded-md font-bold transition-all border ${
                      mapStyle === style 
                        ? 'bg-cyan-600 border-cyan-400 shadow-lg' 
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {style.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Current Algorithm Name & Description - Always visible status when not collapsed */}
        {!isMenuCollapsed && (
          <div className="mb-3 p-2.5 bg-gray-950/80 rounded-xl border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <div className="text-base font-black text-yellow-400 flex justify-between items-center tracking-tight leading-tight">
              {ALGORITHMS[algorithm].name}
            </div>
            {!isRunning && <div className="text-[10px] text-gray-400 mt-1 leading-tight font-medium">{ALGORITHMS[algorithm].description}</div>}
          </div>
        )}
        
        {/* Grouped Action Area - Hidden when collapsed */}
        {!isRunning && !countdown && !isMenuCollapsed && (
          <div className="flex flex-col gap-2 p-2.5 bg-gray-950/40 rounded-xl border border-gray-800 shadow-inner">
            <div className="flex gap-1.5 items-stretch flex-wrap">
              <button
                onClick={handleStart}
                disabled={waypoints.length < 2 || isLoading || countdown !== null}
                className={`h-9 rounded-lg px-4 font-black flex-1 text-xs tracking-widest text-white transition-all duration-300 transform active:scale-95 shadow-xl ${
                  waypoints.length < 2 || isLoading || graph.ways.length === 0
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' 
                    : 'bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-300 hover:to-teal-500 ring-2 ring-emerald-500/20'
                }`}
              >
                {waypoints.length < 2 ? 'SELECT POINTS' : (isLoading || graph.ways.length === 0 ? 'WAIT' : 'START')}
              </button>
              
              <button
                onClick={() => setWaypoints([])}
                className="px-2 h-9 bg-red-950/40 hover:bg-red-900/60 text-red-400/80 rounded-lg shadow-md font-bold text-[10px] transition-all border border-red-900/30 active:scale-95"
              >CLR</button>
              
              <button
                onClick={resetAll}
                className="px-2 h-9 bg-gray-700/50 hover:bg-gray-600 text-gray-300 rounded-lg shadow-md font-bold text-[10px] transition-all border border-gray-600/50 active:scale-95"
              >RST</button>
            </div>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={(isRunning || isLoading || countdown !== null) && !isRecording}
              className={`w-full h-7 text-[9px] font-black rounded transition-all shadow-xl active:scale-[0.98] ${
                countdown !== null ? 'bg-amber-500' : isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600 shadow-purple-900/30'
              } text-white disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
            >
              {countdown !== null ? `⏳ ${countdown}` : isRecording ? 'STOP' : 'REC & START'}
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
          {status === 'no_path' && (
            <div className="bg-red-950/40 p-3 rounded-lg border border-red-500/30">
              <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                <span>❌ No path found</span>
              </p>
              {failedSegment && (
                <p className="text-red-300/80 text-[10px] mt-1 font-mono leading-tight">
                  Disconnect: <span className="text-white font-bold">{failedSegment.from}</span> 
                  <br/>→ <span className="text-white font-bold">{failedSegment.to}</span>
                </p>
              )}
            </div>
          )}
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
        className={`draggable-panel absolute top-2.5 z-[1000] bg-gray-900/90 p-2 rounded-lg text-white backdrop-blur-md border border-gray-800 w-[calc(100%-2rem)] max-w-[170px] transition-all duration-300 shadow-2xl ${isDraggingScore ? 'cursor-grabbing' : ''}`}
        style={scorePanelPos || (isShortsMode ? { 
          left: 'max(0.4rem, calc(50vw - (100vh * 9/16 / 2) + 10px))', 
          transform: 'none' 
        } : { left: '0.75rem' })}
        onPointerMove={handleScorePointerMove}
        onPointerUp={handleScorePointerUp}
      >
        <div 
          className="flex flex-col mb-1.5 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleScorePointerDown}
        >
          <h1 className="text-[8px] font-black tracking-[0.1em] text-cyan-400 leading-none mb-1 opacity-80 uppercase">
            {cityKey === 'gwanghwamun' ? 'BTS LIVE' : 'GPS SYSTEM'}
          </h1>
          <div className="flex items-baseline justify-between overflow-hidden">
            <h2 className="text-[11px] font-black text-white truncate max-w-[110px]">
              {cityKey === 'la' ? 'L.A.' : cityKey === 'dc' ? 'D.C.' : cityKey === 'ny' ? 'N.Y.' : city.name.split(' (')[0]}
            </h2>
            <span className="text-[8px] font-mono text-yellow-400 bg-yellow-400/10 px-1 py-0.5 rounded border border-yellow-400/20">
              {algorithm.toUpperCase()}
            </span>
          </div>
        </div>
        
        <div className="p-1.5 bg-gray-950/60 rounded border border-gray-800 space-y-1 font-mono shadow-inner">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-[9px] font-bold">EXP</span>
            <span className="text-cyan-400 font-black text-xs">{stats.edges}</span>
          </div>
          <div className="flex justify-between items-center border-t border-white/5 pt-1">
            <span className="text-gray-500 text-[9px] font-bold">TIME</span>
            <span className="text-green-400 font-bold text-xs">{((stats.time || 0) / 1000).toFixed(1)}s</span>
          </div>
          <div className="flex justify-between items-center border-t border-white/5 pt-1">
            <span className="text-gray-500 text-[9px] font-bold">DIST</span>
            <span className="text-orange-400 font-black text-xs">{(stats.distance || 0).toFixed(0)}m</span>
          </div>
        </div>
        {status === 'success' && (
          <div className="mt-1.5 text-green-400 text-[9px] font-black text-center tracking-widest bg-green-400/10 py-0.5 rounded border border-green-400/20">
             FINISHED
          </div>
        )}
        {status === 'running' && <p className="mt-1.5 text-cyan-400 text-[8px] font-black font-mono tracking-tighter text-center animate-pulse uppercase">Searching...</p>}
      </div>

      {/* Destination HUD Overlay - Draggable & High Contrast for Longform */}
      {currentDestName && (
        <div 
          className={`draggable-panel absolute z-[1001] pointer-events-auto transition-shadow ${isDraggingHud ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={hudPanelPos || { 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, 120px)' 
          }}
          onPointerDown={handleHudPointerDown}
          onPointerMove={handleHudPointerMove}
          onPointerUp={handleHudPointerUp}
        >
          <div className="bg-gray-900/95 backdrop-blur-xl border border-yellow-500/60 px-5 py-2.5 rounded-2xl flex items-center gap-4 shadow-[0_0_30px_rgba(234,179,8,0.3)] animate-fade-in-up hover:scale-105 transition-transform">
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-black text-yellow-500 tracking-[0.2em] uppercase leading-none mb-1">TARGET PATH</span>
              <span className="text-[13px] font-black text-white tracking-widest uppercase italic leading-none truncate max-w-[200px]">
                {currentDestName}
              </span>
            </div>
            <div className="h-6 w-[2px] bg-yellow-500/30 rounded-full"></div>
            <div className="text-lg">🎯</div>
          </div>
        </div>
      )}

      {/* Map with dimming effect - Key ensures total re-render on city change */}
      <MapContainer 
        key={cityKey}
        center={city.center} 
        zoom={city.zoom || 13} 
        zoomControl={false}
        preferCanvas={true}
        className={`w-full h-full ${isRunning ? 'map-dimmed' : 'map-normal'}`}
      >
        {/* Hide ZoomControl when running/recording/countdown, match menu behavior */}
        {!recordMode && !isRunning && !countdown && !isRecording && showMenu && (
          <ZoomControl position="topright" />
        )}
        <ChangeView center={city.center} isMapLocked={isMapLocked} isShortsMode={isShortsMode} city={city} waypoints={waypoints} isRunning={isRunning} isSuccessZooming={isSuccessZooming} />
        <SegmentCameraView isRunning={isRunning} currentSegmentIdx={currentSegmentIdx} waypoints={waypoints} isShortsMode={isShortsMode} isAutoFollow={isAutoFollow} setBounds={setBounds} />
        <ResultOverviewHandler status={status} waypoints={waypoints} isShortsMode={isShortsMode} setIsSuccessZooming={setIsSuccessZooming} />
        <TileLayer
          attribution={mapStyle === 'satellite' ? 'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' : '&copy; <a href="https://carto.com/">CARTO</a>'}
          url={MAP_STYLES[mapStyle]}
        />
        {(status !== 'success' && !isSuccessZooming) && (
          <RoadLoader setBounds={setBounds} isMapLocked={isMapLocked} />
        )}
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
        
        {/* Final path with Orange glow effect - High Visibility */}
        {finalPath.length > 0 && (
          <>
            <Polyline 
              positions={finalPath} 
              pathOptions={{
                color: '#fb923c', // Lighter orange for better visibility
                weight: 12,
                opacity: 0.4,
                className: 'path-glow',
                pane: 'overlayPane'
              }}
            />
            <Polyline 
              positions={finalPath} 
              pathOptions={{
                color: '#f97316',
                weight: 6,
                opacity: 0.9,
                pane: 'overlayPane'
              }}
            />
          </>
        )}
        
        {/* Start/End/Waypoints markers */}
        {/* Start/End/Waypoints markers */}
        {waypoints.map((pt, i) => {
           const isBts = pt.name?.includes('BTS');
           return (
             <CircleMarker 
               key={i} 
               center={pt} 
               radius={isBts ? 12 : 8} 
               fillColor={isBts ? "#a855f7" : (i === 0 ? "#22c55e" : "#ef4444")} 
               fillOpacity={1} 
               color="#fff" 
               weight={2} 
               className={isBts ? 'animate-pulse' : ''}
             />
           );
        })}
      </MapContainer>
    </div>
  );
};

export default RealMapVisualizer;
