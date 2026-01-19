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

  const run = useCallback(async (algoFns) => {
    if (!start || !end || !graph.nodes || !graph.edges) return;
    
    const startId = findNearestNode(graph.nodes, start.lat, start.lng);
    const endId = findNearestNode(graph.nodes, end.lat, end.lng);
    
    if (!startId || !endId) {
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

    const gen = algoFn(graph.nodes, graph.edges, startId, endId);
    
    let dotCount = 0;
    dotsIntervalRef.current = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setProcessingDots('.'.repeat(dotCount));
    }, 300);
    
    startTimeRef.current = Date.now();
    
    if (!showVisualization) {
      let result = null;
      for (const val of gen) {
        result = val;
        if (val.type === 'found' || val.type === 'not_found') break;
      }
      
      if (result && result.type === 'found') {
        const elapsed = Date.now() - startTimeRef.current;
        setVisitedEdges(result.visitedEdges);
        setFinalPath(result.path);
        setStats({ edges: result.visitedEdges.length, time: elapsed, distance: result.totalDistance * 1000 });
        setStatus('success');
        playSuccess();
      } else {
        setStatus('no_path');
      }
      stop();
      return;
    }

    const step = () => {
      let iterations = 0;
      let lastValue = null;
      const stepsPerTick = speed <= 10 ? 20 : speed <= 25 ? 50 : 120;
      
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

      if (lastValue.type === 'visiting') {
        const allEdges = lastValue.visitedEdges;
        const filteredEdges = density === 1 ? allEdges : allEdges.filter((_, i) => i % density === 0);
        setVisitedEdges(filteredEdges);
        setStats({ edges: allEdges.length, time: Date.now() - startTimeRef.current, distance: (lastValue.currentDistance || 0) * 1000 });
        if (allEdges.length % 50 === 0) playSearchTick();
        const delay = Math.max(1, 41 - speed); 
        animationRef.current = setTimeout(step, delay);
      } else if (lastValue.type === 'found') {
        stop();
        const elapsed = Date.now() - startTimeRef.current;
        setVisitedEdges(lastValue.visitedEdges);
        setFinalPath(lastValue.path);
        setStats({ edges: lastValue.visitedEdges.length, time: elapsed, distance: lastValue.totalDistance * 1000 });
        setStatus('success');
        playSuccess();
      } else {
        stop();
        setStatus('no_path');
      }
    };
    
    step();
  }, [start, end, graph, speed, algorithm, density, showVisualization, findNearestNode, haversine, stop]);

  return {
    isRunning, status, setStatus, stats, setStats, visitedEdges, setVisitedEdges, finalPath, setFinalPath, processingDots, setProcessingDots,
    speed, setSpeed, algorithm, setAlgorithm, density, setDensity, showVisualization, setShowVisualization,
    run, stop, reset
  };
};
