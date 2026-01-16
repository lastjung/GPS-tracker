import React, { useState, useCallback, useRef, useEffect } from 'react';
import { bfs, dijkstra, astar, ALGORITHMS } from '../algorithms';

const CELL_SIZE = 20;
const GRID_ROWS = 25;
const GRID_COLS = 40;

// Cell types: 0 = empty, 1 = wall, 2 = weighted
const createEmptyGrid = () => {
  return Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(0));
};

const GridVisualizer = () => {
  const [grid, setGrid] = useState(createEmptyGrid);
  const [start, setStart] = useState([2, 2]);
  const [end, setEnd] = useState([GRID_ROWS - 3, GRID_COLS - 3]);
  const [visited, setVisited] = useState(new Set());
  const [frontier, setFrontier] = useState([]);
  const [path, setPath] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [algorithm, setAlgorithm] = useState('bfs');
  const [speed, setSpeed] = useState(20);
  const [stats, setStats] = useState({ visited: 0, pathLength: 0, time: 0 });
  const [mode, setMode] = useState('wall'); // 'wall', 'start', 'end'
  
  const isMouseDown = useRef(false);
  const animationRef = useRef(null);

  const resetVisualization = useCallback(() => {
    setVisited(new Set());
    setFrontier([]);
    setPath([]);
    setStats({ visited: 0, pathLength: 0, time: 0 });
  }, []);

  const clearGrid = useCallback(() => {
    setGrid(createEmptyGrid());
    resetVisualization();
  }, [resetVisualization]);

  const handleCellInteraction = useCallback((row, col) => {
    if (isRunning) return;
    
    if (mode === 'start') {
      setStart([row, col]);
      resetVisualization();
    } else if (mode === 'end') {
      setEnd([row, col]);
      resetVisualization();
    } else {
      setGrid(prev => {
        const newGrid = prev.map(r => [...r]);
        newGrid[row][col] = newGrid[row][col] === 1 ? 0 : 1;
        return newGrid;
      });
    }
  }, [isRunning, mode, resetVisualization]);

  const handleMouseDown = (row, col) => {
    isMouseDown.current = true;
    handleCellInteraction(row, col);
  };

  const handleMouseEnter = (row, col) => {
    if (isMouseDown.current && mode === 'wall') {
      setGrid(prev => {
        const newGrid = prev.map(r => [...r]);
        newGrid[row][col] = 1;
        return newGrid;
      });
    }
  };

  const handleMouseUp = () => {
    isMouseDown.current = false;
  };

  const runAlgorithm = useCallback(async () => {
    resetVisualization();
    setIsRunning(true);
    
    const algorithms = { bfs, dijkstra, astar };
    const gen = algorithms[algorithm](grid, start, end);
    const startTime = performance.now();
    let visitedCount = 0;
    
    const step = () => {
      const { value, done } = gen.next();
      
      if (done || !value) {
        setIsRunning(false);
        return;
      }
      
      if (value.type === 'visiting') {
        visitedCount++;
        setVisited(new Set(value.visited));
        setFrontier(value.frontier || []);
        setStats(prev => ({ ...prev, visited: visitedCount }));
        animationRef.current = setTimeout(step, speed);
      } else if (value.type === 'found') {
        const endTime = performance.now();
        setPath(value.path);
        setStats(prev => ({
          ...prev,
          pathLength: value.path.length,
          time: Math.round(endTime - startTime)
        }));
        setIsRunning(false);
      } else if (value.type === 'not_found') {
        setIsRunning(false);
      }
    };
    
    step();
  }, [algorithm, grid, start, end, speed, resetVisualization]);

  const stopAlgorithm = useCallback(() => {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    setIsRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
    };
  }, []);

  const getCellColor = (row, col) => {
    const key = `${row},${col}`;
    if (row === start[0] && col === start[1]) return '#22c55e'; // green - start
    if (row === end[0] && col === end[1]) return '#ef4444'; // red - end
    if (path.some(([r, c]) => r === row && c === col)) return '#a3e635'; // lime - path
    if (grid[row][col] === 1) return '#374151'; // dark gray - wall
    if (frontier.some(([r, c]) => r === row && c === col)) return '#facc15'; // yellow - frontier
    if (visited.has(key)) return '#06b6d4'; // cyan - visited
    return '#1f2937'; // dark - empty
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 min-h-screen">
      {/* Control Panel */}
      <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-800 rounded-lg w-full max-w-4xl">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Algorithm</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            disabled={isRunning}
            className="bg-gray-700 text-white px-3 py-2 rounded"
          >
            {Object.entries(ALGORITHMS).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Mode</label>
          <div className="flex gap-1">
            <button
              onClick={() => setMode('wall')}
              className={`px-3 py-2 rounded ${mode === 'wall' ? 'bg-gray-600' : 'bg-gray-700'} text-white`}
            >Wall</button>
            <button
              onClick={() => setMode('start')}
              className={`px-3 py-2 rounded ${mode === 'start' ? 'bg-green-600' : 'bg-gray-700'} text-white`}
            >Start</button>
            <button
              onClick={() => setMode('end')}
              className={`px-3 py-2 rounded ${mode === 'end' ? 'bg-red-600' : 'bg-gray-700'} text-white`}
            >End</button>
          </div>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Speed: {speed}ms</label>
          <input
            type="range"
            min="1"
            max="100"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-32"
          />
        </div>
        
        <div className="flex items-end gap-2">
          {!isRunning ? (
            <button
              onClick={runAlgorithm}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold"
            >▶ Start</button>
          ) : (
            <button
              onClick={stopAlgorithm}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
            >■ Stop</button>
          )}
          <button
            onClick={clearGrid}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
          >Clear</button>
        </div>
        
        {/* Stats */}
        <div className="flex items-end gap-4 ml-auto text-white">
          <div className="text-center">
            <div className="text-xl font-bold text-cyan-400">{stats.visited}</div>
            <div className="text-xs text-gray-400">Visited</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-lime-400">{stats.pathLength}</div>
            <div className="text-xs text-gray-400">Path Length</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-400">{stats.time}ms</div>
            <div className="text-xs text-gray-400">Time</div>
          </div>
        </div>
      </div>
      
      {/* Grid */}
      <div 
        className="border border-gray-700 rounded overflow-hidden"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} className="flex">
            {row.map((cell, colIdx) => (
              <div
                key={colIdx}
                onMouseDown={() => handleMouseDown(rowIdx, colIdx)}
                onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: getCellColor(rowIdx, colIdx),
                  border: '1px solid #111827',
                  transition: 'background-color 0.1s'
                }}
              />
            ))}
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex gap-4 mt-4 text-sm text-gray-400">
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-green-500 rounded"></span> Start</div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-red-500 rounded"></span> End</div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-gray-600 rounded"></span> Wall</div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-cyan-500 rounded"></span> Visited</div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-400 rounded"></span> Frontier</div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 bg-lime-400 rounded"></span> Path</div>
      </div>
    </div>
  );
};

export default GridVisualizer;
