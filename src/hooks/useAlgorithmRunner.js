import { useState, useRef, useCallback, useEffect } from 'react';
import { playSuccess, playSearchTick } from '../utils/audio';

export const useAlgorithmRunner = (graph, start, end, options) => {
  const { findNearestNode, haversine } = options;
  
  // States - unified with what RealMapVisualizer expects
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState({ edges: 0, time: 0, distance: 0 });
  const [visitedEdges, setVisitedEdges] = useState([]);
  const [finalPath, setFinalPath] = useState([]);
  const [processingDots, setProcessingDots] = useState('');
  
  // UI Control states
  const [speed, setSpeed] = useState(4);
  const [algorithm, setAlgorithm] = useState('astar');
  const [density, setDensity] = useState(1);
  const [showVisualization, setShowVisualization] = useState(true);
  const [isTurboMode, setIsTurboMode] = useState(false);

  const animationRef = useRef(null);
  const dotsIntervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const reset = useCallback(() => {
    setVisitedEdges([]);
    setFinalPath([]);
    setStats({ edges: 0, time: 0, distance: 0 });
    setStatus('idle');
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (animationRef.current) clearTimeout(animationRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    setProcessingDots('');
  }, []);

  const run = useCallback(async (algoFns, waypointsOverride) => {
    // Determine waypoints: override > props
    let points = [];
    if (waypointsOverride && waypointsOverride.length >= 2) {
      points = waypointsOverride;
    } else if (start && end) {
      points = [start, end];
    }

    if (points.length < 2 || !graph.nodes || !graph.edges) return;
    
    // Check all points validity
    const nodeIds = points.map(p => findNearestNode(graph.nodes, p.lat, p.lng));
    if (nodeIds.some(id => !id)) {
      setStatus('click_too_far');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }

    setIsRunning(true);
    setStatus('running');
    setVisitedEdges([]);
    setFinalPath([]);
    setStats({ edges: 0, time: 0, distance: 0 });
    
    const algoFn = algoFns[algorithm];
    if (!algoFn) {
        setStatus('idle');
        setIsRunning(false);
        return;
    }

    // Logic for multi-segment execution
    const segmentCount = points.length - 1;
    let currentSegment = 0;
    let accumulatedPath = [];
    let accumulatedVisited = []; // Store visited edges from previous segments
    let accumulatedDistance = 0;
    let accumulatedTime = 0;
    
    startTimeRef.current = Date.now();

    // Setup first segment
    let startId = nodeIds[0];
    let endId = nodeIds[1];
    let gen = algoFn(graph.nodes, graph.edges, startId, endId);

    // Dots animation
    let dotCount = 0;
    dotsIntervalRef.current = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setProcessingDots('.'.repeat(dotCount));
    }, 300);
    
    // No Viz Mode (Simplified for brevity, assuming viz is main use case)
    if (!showVisualization) {
      try {
        let totalEdges = 0;
        
        for (let i = 0; i < segmentCount; i++) {
          const sId = nodeIds[i];
          const eId = nodeIds[i+1];
          const segmentGen = algoFn(graph.nodes, graph.edges, sId, eId);
          
          let result = null;
          for (const val of segmentGen) {
            result = val;
            if (val.type === 'found' || val.type === 'not_found') break;
          }

          if (result && result.type === 'found') {
            accumulatedPath = [...accumulatedPath, ...result.path];
            accumulatedVisited = [...accumulatedVisited, ...result.visitedEdges];
            accumulatedDistance += result.totalDistance;
            totalEdges += result.visitedEdges.length;
          } else {
            setStatus('no_path');
            stop();
            return;
          }
        }
        
        const elapsed = Date.now() - startTimeRef.current;
        // In No Viz Mode, we might want to show all explored areas at the end
        setVisitedEdges(accumulatedVisited); 
        setFinalPath(accumulatedPath);
        setStats({ edges: totalEdges, time: elapsed, distance: accumulatedDistance * 1000 });
        setStatus('success');
        playSuccess();
      } catch (e) {
        setStatus('error');
      } finally {
        stop();
      }
      return;
    }

    // Viz Mode
    const step = () => {
      let iterations = 0;
      let lastValue = null;
      let baseSteps = speed <= 10 ? 20 : speed <= 25 ? 50 : 120;
      
      // Turbo Mode: Scale iteration count by the number of visited edges to prevent late-stage lag
      const turboFactor = isTurboMode ? Math.max(1, Math.floor((accumulatedVisited.length + 1000) / 1000)) : 1;
      const stepsPerTick = baseSteps * turboFactor;
      
      while (iterations < stepsPerTick) {
        const { value, done } = gen.next();
        if (done || !value) break;
        lastValue = value;
        if (value.type === 'found' || value.type === 'not_found') break;
        iterations++;
      }
      
      if (!lastValue) {
          stop();
          return;
      }

      const elapsed = Date.now() - startTimeRef.current;

      if (lastValue.type === 'visiting') {
        const currentEdges = lastValue.visitedEdges;
        const filteredEdges = density === 1 ? currentEdges : currentEdges.filter((_, i) => i % density === 0);
        
        // Show PREVIOUS segments + CURRENT segment progress
        setVisitedEdges([...accumulatedVisited, ...filteredEdges]);
        
        const totalEdgesCount = accumulatedVisited.length + currentEdges.length;

        setStats({ 
            edges: totalEdgesCount, 
            time: elapsed, 
            distance: (accumulatedDistance + (lastValue.currentDistance || 0)) * 1000 
        });
        
        if (currentEdges.length % 50 === 0) playSearchTick();
        const delay = Math.max(1, 41 - speed); 
        animationRef.current = setTimeout(step, delay);

      } else if (lastValue.type === 'found') {
        // Segment finished
        accumulatedPath = [...accumulatedPath, ...lastValue.path];
        accumulatedDistance += lastValue.totalDistance;
        accumulatedVisited = [...accumulatedVisited, ...lastValue.visitedEdges]; // Lock in this segment's edges
        
        currentSegment++;
        
        if (currentSegment < segmentCount) {
           // Prepare next segment
           startId = nodeIds[currentSegment];
           endId = nodeIds[currentSegment + 1];
           gen = algoFn(graph.nodes, graph.edges, startId, endId);
           
           setFinalPath([...accumulatedPath]); 
           // Maintain all previous visited edges during pause
           setVisitedEdges(accumulatedVisited); 
           
           animationRef.current = setTimeout(step, 200);
        } else {
           // All done
           stop();
           setVisitedEdges(accumulatedVisited); // Show EVERYTHING
           setFinalPath(accumulatedPath);
           setStats({ 
               edges: accumulatedVisited.length, 
               time: elapsed, 
               distance: accumulatedDistance * 1000 
           });
           setStatus('success');
           playSuccess();
        }

      } else {
        // Not found in current segment
        stop();
        setStatus('no_path');
      }
    };
    
    step();
  }, [start, end, graph, speed, algorithm, density, showVisualization, findNearestNode, haversine, stop]);

  return {
    isRunning, status, setStatus, stats, setStats, visitedEdges, setVisitedEdges, finalPath, setFinalPath, processingDots, setProcessingDots,
    speed, setSpeed, algorithm, setAlgorithm, density, setDensity, showVisualization, setShowVisualization, isTurboMode, setIsTurboMode,
    run, stop, reset
  };
};
