import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import './Whiteboard.css';

const TOOL_PEN = 'pen';
const TOOL_ERASER = 'eraser';
const TOOL_RECT = 'rectangle';
const TOOL_CIRCLE = 'circle';
const TOOL_TEXT = 'text';

function Whiteboard({ room, username, userPermissions }) {
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
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomInfo, setRoomInfo] = useState(null);
  const [shareableLink, setShareableLink] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);

  // Check if user can edit
  const canEdit = userPermissions === 'edit' || userPermissions === 'owner';

  // Generate shareable link
  const generateShareableLink = useCallback(() => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${room}`;
    setShareableLink(link);
    setShowShareDialog(true);
  }, [room]);

  // Copy link to clipboard
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      alert('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareableLink;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Link copied to clipboard!');
    }
  }, [shareableLink]);

  // Save canvas state to server
  const saveCanvasState = useCallback(() => {
    if (socketRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const canvasData = canvas.toDataURL();
      socketRef.current.emit('save-canvas-state', {
        room: room,
        canvasData: canvasData
      });
    }
  }, [room]);

  // Load canvas state from base64 data
  const loadCanvasState = useCallback((canvasData) => {
    if (!canvasRef.current || !canvasData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      console.log('Canvas state loaded from server');
    };
    
    img.onerror = (error) => {
      console.error('Error loading canvas state:', error);
    };
    
    img.src = canvasData;
  }, []);

  // Replay drawing history
  const replayDrawingHistory = useCallback((drawings) => {
    if (!canvasRef.current || !drawings || drawings.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    console.log(`Replaying ${drawings.length} drawing commands`);
    
    // Sort drawings by timestamp to ensure correct order
    const sortedDrawings = [...drawings].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Replay each drawing command
    sortedDrawings.forEach((data, index) => {
      // Add a small delay to make the replay visible (optional)
      setTimeout(() => {
        switch (data.tool) {
          case TOOL_PEN:
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
            ctx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
            ctx.stroke();
            break;

          case TOOL_ERASER:
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = data.lineWidth * 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
            ctx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            break;

          case TOOL_RECT:
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.lineWidth;
            const rectX = data.x0 * canvas.width;
            const rectY = data.y0 * canvas.height;
            const rectWidth = (data.x1 - data.x0) * canvas.width;
            const rectHeight = (data.y1 - data.y0) * canvas.height;
            ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
            break;

          case TOOL_CIRCLE:
            const centerX = data.x0 * canvas.width;
            const centerY = data.y0 * canvas.height;
            const endX = data.x1 * canvas.width;
            const endY = data.y1 * canvas.height;
            const radius = Math.sqrt((endX - centerX) ** 2 + (endY - centerY) ** 2);
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.lineWidth;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
            break;

          case TOOL_TEXT:
            if (data.text) {
              ctx.fillStyle = data.color;
              ctx.font = `${data.lineWidth * 8}px Arial`;
              ctx.fillText(data.text, data.x0 * canvas.width, data.y0 * canvas.height);
            }
            break;
        }
      }, index * 10); // 10ms delay between each drawing command
    });
    
    // Mark canvas as loaded after replay is complete
    setTimeout(() => {
      setIsCanvasLoaded(true);
      console.log('Drawing history replay completed');
    }, drawings.length * 10 + 100);
  }, []);

  // Save as image
  const saveAsImage = useCallback(() => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `whiteboard-${room}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [room]);

  // Save as PDF
  const saveAsPDF = useCallback(async () => {
    try {
      // Dynamic import for jsPDF to avoid bundle size issues
      const { jsPDF } = await import('jspdf');
      
      const canvas = canvasRef.current;
      const imgData = canvas.toDataURL('image/png');
      
      // Calculate dimensions to fit canvas aspect ratio
      const canvasAspectRatio = canvas.width / canvas.height;
      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = pdfWidth / canvasAspectRatio;
      
      const pdf = new jsPDF({
        orientation: canvasAspectRatio > 1 ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`whiteboard-${room}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert('Error saving PDF. Please try saving as image instead.');
    }
  }, [room]);

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
    if (!canEdit) return;
    const canvas = canvasRef.current;
    const snapshot = canvas.toDataURL();
    setHistory(prev => [...prev, snapshot]);
    setRedoStack([]); // Clear redo stack when new action is performed
  }, [canEdit]);

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
    if (!canEdit) return;
    
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
  }, [color, lineWidth, room, canEdit]);

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
    if (!canEdit || !isCanvasLoaded) return;
    
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
  }, [tool, getMousePos, drawText, saveState, canEdit, isCanvasLoaded]);

  const handleMouseMove = useCallback((e) => {
    if (!canEdit || !isCanvasLoaded) return;
    
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
  }, [tool, startPos, isDrawing, getMousePos, drawLine, erase, drawPreview, color, lineWidth, room, canEdit, isCanvasLoaded]);

  const handleMouseUp = useCallback((e) => {
    if (!canEdit || !isCanvasLoaded) return;
    
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
        // Save canvas state after drawing is complete
        setTimeout(() => {
          saveCanvasState();
        }, 100);
        break;
    }
  }, [tool, startPos, isDrawing, getMousePos, clearPreview, drawRect, drawCircle, saveState, color, lineWidth, room, canEdit, isCanvasLoaded, saveCanvasState]);

  // Undo/Redo functions
  const handleUndo = useCallback(() => {
    if (history.length === 0 || !canEdit) return;

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
        // Save the undone state
        setTimeout(() => {
          saveCanvasState();
        }, 100);
      };
      img.src = previousState;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      saveCanvasState();
    }
  }, [history, canEdit, saveCanvasState]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !canEdit) return;

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
      // Save the redone state
      setTimeout(() => {
        saveCanvasState();
      }, 100);
    };
    img.src = nextState;
  }, [redoStack, canEdit, saveCanvasState]);

  const clearCanvas = useCallback(() => {
    if (!canEdit) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    saveState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Emit clear canvas event
    if (socketRef.current) {
      socketRef.current.emit('canvas-clear', { room: room });
    }
  }, [saveState, room, canEdit]);

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

      // Handle canvas state from server
      socketRef.current.on('canvas-state', (data) => {
        console.log('Received canvas state from server');
        loadCanvasState(data.canvasData);
        setIsCanvasLoaded(true);
      });

      // Handle drawing history from server
      socketRef.current.on('drawing-history', (data) => {
        console.log('Received drawing history from server:', data.drawings.length, 'commands');
        replayDrawingHistory(data.drawings);
      });

      // Handle server request for canvas state
      socketRef.current.on('request-canvas-state', (data) => {
        if (data.room === room) {
          saveCanvasState();
        }
      });

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
            if (data.text) {
              currentCtx.fillStyle = data.color;
              currentCtx.font = `${data.lineWidth * 8}px Arial`;
              currentCtx.fillText(data.text, data.x0 * canvas.width, data.y0 * canvas.height);
            }
            break;
        }
      });

      // Handle canvas clear
      socketRef.current.on('canvas-clear', () => {
        const currentCtx = canvasRef.current.getContext('2d');
        currentCtx.clearRect(0, 0, canvas.width, canvas.height);
        setHistory([]); // Clear local history when canvas is cleared
        setRedoStack([]);
      });

      socketRef.current.on('room-joined', (data) => {
        console.log('Joined room:', data.room, 'Users:', data.users);
        setRoomUsers(data.users);
        setRoomInfo(data.roomInfo);
        
        // If no canvas state or history was received, mark as loaded
        setTimeout(() => {
          if (!isCanvasLoaded) {
            setIsCanvasLoaded(true);
            console.log('No canvas state to load, marking as ready');
          }
        }, 1000);
      });

      // Handle user join/leave
      socketRef.current.on('user-joined', (data) => {
        console.log(`${data.username} joined. Active users: ${data.activeUsers}`);
        setRoomUsers(data.users);
      });

      socketRef.current.on('user-left', (data) => {
        console.log(`${data.username} left. Active users: ${data.activeUsers}`);
        setRoomUsers(data.users);
      });

      // Handle permission updates
      socketRef.current.on('permission-updated', (data) => {
        if (data.username === username) {
          console.log('Your permissions updated:', data.permission);
          // This would typically be handled by the parent component
        }
      });

      // Handle permission denied
      socketRef.current.on('permission-denied', (data) => {
        alert(`Permission denied: ${data.message}`);
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
  }, [room, username, loadCanvasState, replayDrawingHistory, saveCanvasState, isCanvasLoaded]);

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
      <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, background: 'white', padding: '10px', borderRadius: '8px', margin: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h3 style={{ margin: 0 }}>
              Room: <strong>{room}</strong> | You: <strong>{username}</strong>
              {roomInfo && (
                <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '10px' }}>
                  ({roomInfo.type} room - {userPermissions})
                </span>
              )}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={generateShareableLink}
              style={{ padding: '5px 10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔗 Share
            </button>
            <button 
              onClick={saveAsImage}
              style={{ padding: '5px 10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              💾 PNG
            </button>
            <button 
              onClick={saveAsPDF}
              style={{ padding: '5px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              📄 PDF
            </button>
          </div>
        </div>

        <div style={{ marginTop: '5px', marginBottom: '10px' }}>
          <strong>Present ({roomUsers.length}):</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
            {roomUsers.map((u, i) => (
              <span key={i} style={{ 
                fontSize: '0.8em', 
                backgroundColor: '#f0f0f0', 
                padding: '2px 6px', 
                borderRadius: '12px',
                border: u.username === username ? '2px solid #007bff' : '1px solid #ddd'
              }}>
                {u.username} {u.permission && `(${u.permission})`}
              </span>
            ))}
          </div>
        </div>

        {!canEdit && (
          <div style={{ color: '#dc3545', fontSize: '0.9em', marginBottom: '10px', fontWeight: 'bold' }}>
            ⚠️ You have view-only access to this whiteboard
          </div>
        )}

        <div className="toolbar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setTool(TOOL_PEN)}
            disabled={!canEdit}
            style={{ 
              backgroundColor: tool === TOOL_PEN ? '#ccc' : 'white',
              opacity: canEdit ? 1 : 0.5,
              cursor: canEdit ? 'pointer' : 'not-allowed'
            }}
          >
            ✏️ Pen
          </button>
          <button
            onClick={() => setTool(TOOL_RECT)}
            disabled={!canEdit}
            style={{ 
              backgroundColor: tool === TOOL_RECT ? '#ccc' : 'white',
              opacity: canEdit ? 1 : 0.5,
              cursor: canEdit ? 'pointer' : 'not-allowed'
            }}
          >
            ▭ Rectangle
          </button>
          <button
            onClick={() => setTool(TOOL_CIRCLE)}
            disabled={!canEdit}
            style={{ 
              backgroundColor: tool === TOOL_CIRCLE ? '#ccc' : 'white',
              opacity: canEdit ? 1 : 0.5,
              cursor: canEdit ? 'pointer' : 'not-allowed'
            }}
          >
            ◯ Circle
          </button>
          <button
            onClick={() => setTool(TOOL_TEXT)}
            disabled={!canEdit}
            style={{ 
              backgroundColor: tool === TOOL_TEXT ? '#ccc' : 'white',
              opacity: canEdit ? 1 : 0.5,
              cursor: canEdit ? 'pointer' : 'not-allowed'
            }}
          >
            🅣 Text
          </button>
          <button
            onClick={() => setTool(TOOL_ERASER)}
            disabled={!canEdit}
            style={{ 
              backgroundColor: tool === TOOL_ERASER ? '#ccc' : 'white',
              opacity: canEdit ? 1 : 0.5,
              cursor: canEdit ? 'pointer' : 'not-allowed'
            }}
          >
            🧽 Eraser
          </button>

          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            disabled={tool === TOOL_ERASER || !canEdit}
            style={{ opacity: canEdit ? 1 : 0.5 }}
          />
          <label>
            Size: {lineWidth}
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={e => setLineWidth(Number(e.target.value))}
              disabled={!canEdit}
              style={{ opacity: canEdit ? 1 : 0.5 }}
            />
          </label>

          <button 
            onClick={handleUndo} 
            disabled={history.length === 0 || !canEdit}
            style={{ opacity: (canEdit && history.length > 0) ? 1 : 0.5 }}
          >
            ↶ Undo
          </button>
          <button 
            onClick={handleRedo} 
            disabled={redoStack.length === 0 || !canEdit}
            style={{ opacity: (canEdit && redoStack.length > 0) ? 1 : 0.5 }}
          >
            ↷ Redo
          </button>
          <button 
            onClick={clearCanvas}
            disabled={!canEdit}
            style={{ opacity: canEdit ? 1 : 0.5 }}
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Share Dialog */}
      {showShareDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '400px',
            maxWidth: '90vw'
          }}>
            <h3>Share Whiteboard</h3>
            <p>Share this link with others to collaborate:</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input
                type="text"
                value={shareableLink}
                readOnly
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={copyToClipboard}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Copy
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowShareDialog(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="whiteboard"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          cursor: !canEdit ? 'not-allowed' : (tool === TOOL_ERASER ? 'crosshair' : 'default'),
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
}

export default Whiteboard;