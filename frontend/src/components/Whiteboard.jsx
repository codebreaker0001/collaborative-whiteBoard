import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import './Whiteboard.css';

const TOOL_PEN = 'pen';
const TOOL_ERASER = 'eraser';
const TOOL_RECT = 'rectangle';
const TOOL_CIRCLE = 'circle';
const TOOL_TEXT = 'text';

function Whiteboard({ room, username }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [tool, setTool] = useState(TOOL_PEN);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [previewCanvas, setPreviewCanvas] = useState(null);

  // Get mouse position relative to canvas
  const getMousePos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Save canvas state for undo/redo
  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    const snapshot = canvas.toDataURL();
    setHistory(prev => [...prev, snapshot]);
    setRedoStack([]); // Clear redo stack when new action is performed
  }, []);

  // Drawing functions
  const drawLine = useCallback((ctx, x0, y0, x1, y1, drawColor, width) => {
    ctx.strokeStyle = drawColor || color;
    ctx.lineWidth = width || lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }, [color, lineWidth]);

  const drawRect = useCallback((ctx, x0, y0, x1, y1, drawColor, width) => {
    ctx.strokeStyle = drawColor || color;
    ctx.lineWidth = width || lineWidth;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }, [color, lineWidth]);

  const drawCircle = useCallback((ctx, x0, y0, x1, y1, drawColor, width) => {
    const radius = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    ctx.strokeStyle = drawColor || color;
    ctx.lineWidth = width || lineWidth;
    ctx.beginPath();
    ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }, [color, lineWidth]);

  const drawText = useCallback((ctx, x, y, drawColor, width) => {
    const text = prompt('Enter text:');
    if (text) {
      ctx.fillStyle = drawColor || color;
      ctx.font = `${(width || lineWidth) * 8}px Arial`;
      ctx.fillText(text, x, y);
      
      // Emit text data for collaboration
      if (socketRef.current) {
        const canvas = canvasRef.current;
        socketRef.current.emit('drawing', {
          x0: x / canvas.width,
          y0: y / canvas.height,
          color: drawColor || color,
          lineWidth: width || lineWidth,
          tool: TOOL_TEXT,
          text: text,
          room: room
        });
      }
    }
  }, [color, lineWidth, room]);

  const erase = useCallback((ctx, x0, y0, x1, y1, width) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = (width || lineWidth) * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }, [lineWidth]);

  // Clear preview canvas
  const clearPreview = useCallback(() => {
    if (previewCanvas) {
      const previewCtx = previewCanvas.getContext('2d');
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
  }, [previewCanvas]);

  // Draw preview for shapes
  const drawPreview = useCallback((x, y) => {
    if (!previewCanvas || tool === TOOL_PEN || tool === TOOL_ERASER || tool === TOOL_TEXT) return;
    
    clearPreview();
    const previewCtx = previewCanvas.getContext('2d');
    
    switch (tool) {
      case TOOL_RECT:
        drawRect(previewCtx, startPos.x, startPos.y, x, y);
        break;
      case TOOL_CIRCLE:
        drawCircle(previewCtx, startPos.x, startPos.y, x, y);
        break;
    }
  }, [previewCanvas, tool, startPos, clearPreview, drawRect, drawCircle]);

  // Event handlers
  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getMousePos(e);
    
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);

    if (tool === TOOL_TEXT) {
      drawText(ctx, pos.x, pos.y);
      saveState();
      setIsDrawing(false);
    } else if (tool === TOOL_PEN || tool === TOOL_ERASER) {
      // For continuous drawing tools, save state at start
      saveState();
    }
  }, [tool, getMousePos, drawText, saveState]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getMousePos(e);
    
    if (!isDrawing) return;
    
    setCurrentPos(pos);

    if (tool === TOOL_PEN) {
      drawLine(ctx, startPos.x, startPos.y, pos.x, pos.y);
      
      // Emit drawing data for real-time collaboration
      if (socketRef.current) {
        socketRef.current.emit('drawing', {
          x0: startPos.x / canvas.width,
          y0: startPos.y / canvas.height,
          x1: pos.x / canvas.width,
          y1: pos.y / canvas.height,
          color: color,
          lineWidth: lineWidth,
          tool: tool,
          room: room
        });
      }
      setStartPos(pos);
    } else if (tool === TOOL_ERASER) {
      erase(ctx, startPos.x, startPos.y, pos.x, pos.y);
      
      // Emit eraser data
      if (socketRef.current) {
        socketRef.current.emit('drawing', {
          x0: startPos.x / canvas.width,
          y0: startPos.y / canvas.height,
          x1: pos.x / canvas.width,
          y1: pos.y / canvas.height,
          lineWidth: lineWidth,
          tool: tool,
          room: room
        });
      }
      setStartPos(pos);
    } else {
      // Show preview for shapes
      drawPreview(pos.x, pos.y);
    }
  }, [tool, startPos, isDrawing, getMousePos, drawLine, erase, drawPreview, color, lineWidth, room]);

  const handleMouseUp = useCallback((e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getMousePos(e);
    
    if (!isDrawing) return;
    
    setIsDrawing(false);
    clearPreview();

    switch (tool) {
      case TOOL_RECT:
        drawRect(ctx, startPos.x, startPos.y, pos.x, pos.y);
        // Emit rectangle data
        if (socketRef.current) {
          socketRef.current.emit('drawing', {
            x0: startPos.x / canvas.width,
            y0: startPos.y / canvas.height,
            x1: pos.x / canvas.width,
            y1: pos.y / canvas.height,
            color: color,
            lineWidth: lineWidth,
            tool: tool,
            room: room
          });
        }
        saveState();
        break;
      case TOOL_CIRCLE:
        drawCircle(ctx, startPos.x, startPos.y, pos.x, pos.y);
        // Emit circle data
        if (socketRef.current) {
          socketRef.current.emit('drawing', {
            x0: startPos.x / canvas.width,
            y0: startPos.y / canvas.height,
            x1: pos.x / canvas.width,
            y1: pos.y / canvas.height,
            color: color,
            lineWidth: lineWidth,
            tool: tool,
            room: room
          });
        }
        saveState();
        break;
      case TOOL_PEN:
      case TOOL_ERASER:
        // State already saved in mousedown for continuous tools
        break;
    }
  }, [tool, startPos, isDrawing, getMousePos, clearPreview, drawRect, drawCircle, saveState, color, lineWidth, room]);

  // Undo/Redo functions
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const currentState = canvas.toDataURL();
    
    setRedoStack(prev => [...prev, currentState]);
    
    const newHistory = [...history];
    const previousState = newHistory.pop();
    setHistory(newHistory);
    
    if (previousState) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = previousState;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [history]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const currentState = canvas.toDataURL();
    
    setHistory(prev => [...prev, currentState]);
    
    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    setRedoStack(newRedoStack);
    
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = nextState;
  }, [redoStack]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    saveState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Emit clear canvas event
    if (socketRef.current) {
      socketRef.current.emit('canvas-clear', { room: room });
    }
  }, [saveState, room]);

  // Canvas setup and socket connection
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Create preview canvas
    const preview = document.createElement('canvas');
    preview.style.position = 'absolute';
    preview.style.top = canvas.offsetTop + 'px';
    preview.style.left = canvas.offsetLeft + 'px';
    preview.style.pointerEvents = 'none';
    preview.style.zIndex = '1';
    canvas.parentNode.appendChild(preview);
    setPreviewCanvas(preview);
    
    const resize = () => {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      preview.width = container.clientWidth;
      preview.height = container.clientHeight;
      preview.style.width = container.clientWidth + 'px';
      preview.style.height = container.clientHeight + 'px';
    };
    
    resize();
    window.addEventListener('resize', resize);

    // Socket setup
    if (room) {
      socketRef.current = io('http://localhost:3000');
      
      // Join room with username
      socketRef.current.emit('join-room', { room, username });
      
      // Handle different drawing events
      socketRef.current.on('drawing', (data) => {
        const currentCtx = canvasRef.current.getContext('2d');
        
        switch (data.tool) {
          case TOOL_PEN:
            currentCtx.strokeStyle = data.color;
            currentCtx.lineWidth = data.lineWidth;
            currentCtx.lineCap = 'round';
            currentCtx.lineJoin = 'round';
            currentCtx.beginPath();
            currentCtx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
            currentCtx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
            currentCtx.stroke();
            break;
            
          case TOOL_ERASER:
            currentCtx.globalCompositeOperation = 'destination-out';
            currentCtx.lineWidth = data.lineWidth * 2;
            currentCtx.lineCap = 'round';
            currentCtx.beginPath();
            currentCtx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
            currentCtx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
            currentCtx.stroke();
            currentCtx.globalCompositeOperation = 'source-over';
            break;
            
          case TOOL_RECT:
            currentCtx.strokeStyle = data.color;
            currentCtx.lineWidth = data.lineWidth;
            const rectX = data.x0 * canvas.width;
            const rectY = data.y0 * canvas.height;
            const rectWidth = (data.x1 - data.x0) * canvas.width;
            const rectHeight = (data.y1 - data.y0) * canvas.height;
            currentCtx.strokeRect(rectX, rectY, rectWidth, rectHeight);
            break;
            
          case TOOL_CIRCLE:
            const centerX = data.x0 * canvas.width;
            const centerY = data.y0 * canvas.height;
            const endX = data.x1 * canvas.width;
            const endY = data.y1 * canvas.height;
            const radius = Math.sqrt((endX - centerX) ** 2 + (endY - centerY) ** 2);
            currentCtx.strokeStyle = data.color;
            currentCtx.lineWidth = data.lineWidth;
            currentCtx.beginPath();
            currentCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            currentCtx.stroke();
            break;
            
          case TOOL_TEXT:
            currentCtx.fillStyle = data.color;
            currentCtx.font = `${data.lineWidth * 8}px Arial`;
            currentCtx.fillText(data.text, data.x0 * canvas.width, data.y0 * canvas.height);
            break;
        }
      });
      
      // Handle canvas clear
      socketRef.current.on('canvas-clear', () => {
        const currentCtx = canvasRef.current.getContext('2d');
        currentCtx.clearRect(0, 0, canvas.width, canvas.height);
      });
      
      // Handle user join/leave
      socketRef.current.on('user-joined', (data) => {
        console.log(`${data.username} joined the room`);
      });
      
      socketRef.current.on('user-left', (data) => {
        console.log(`${data.username} left the room`);
      });
      
      // Handle connection events
      socketRef.current.on('connect', () => {
        console.log('Connected to server');
      });
      
      socketRef.current.on('disconnect', () => {
        console.log('Disconnected from server');
      });
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (preview && preview.parentNode) {
        preview.parentNode.removeChild(preview);
      }
    };
  }, [room, username]); // Added username to dependencies

  // Separate useEffect for event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, background: 'white', padding: '10px' }}>
        <h3>Room: {room} | User: {username}</h3>
        
        <div className="toolbar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setTool(TOOL_PEN)}
            style={{ backgroundColor: tool === TOOL_PEN ? '#ccc' : 'white' }}
          >
            ✏️ Pen
          </button>
          <button 
            onClick={() => setTool(TOOL_RECT)}
            style={{ backgroundColor: tool === TOOL_RECT ? '#ccc' : 'white' }}
          >
            ▭ Rectangle
          </button>
          <button 
            onClick={() => setTool(TOOL_CIRCLE)}
            style={{ backgroundColor: tool === TOOL_CIRCLE ? '#ccc' : 'white' }}
          >
            ◯ Circle
          </button>
          <button 
            onClick={() => setTool(TOOL_TEXT)}
            style={{ backgroundColor: tool === TOOL_TEXT ? '#ccc' : 'white' }}
          >
            🅣 Text
          </button>
          <button 
            onClick={() => setTool(TOOL_ERASER)}
            style={{ backgroundColor: tool === TOOL_ERASER ? '#ccc' : 'white' }}
          >
            🧽 Eraser
          </button>

          <input 
            type="color" 
            value={color} 
            onChange={e => setColor(e.target.value)}
            disabled={tool === TOOL_ERASER}
          />
          <label>
            Size: {lineWidth}
            <input 
              type="range" 
              min="1" 
              max="20" 
              value={lineWidth} 
              onChange={e => setLineWidth(Number(e.target.value))} 
            />
          </label>

          <button onClick={handleUndo} disabled={history.length === 0}>
            ↶ Undo
          </button>
          <button onClick={handleRedo} disabled={redoStack.length === 0}>
            ↷ Redo
          </button>
          <button onClick={clearCanvas}>
            🗑️ Clear
          </button>
        </div>
      </div>
      
      <canvas 
        ref={canvasRef} 
        className="whiteboard"
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          cursor: tool === TOOL_ERASER ? 'crosshair' : 'default',
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
}

export default Whiteboard;