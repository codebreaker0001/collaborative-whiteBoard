import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIO } from 'socket.io';

import authRoutes from './routes/auth.js';
import roomRoutes from './routes/room.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173', // your local dev
  'https://collaborative-white-board-5hc8io81g-adarsh-yadavs-projects.vercel.app' // your deployed frontend
];

const io = new SocketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

// Store active users in rooms with their permissions
const activeRooms = new Map();

// Mock room info - replace with actual database queries
const getRoomInfo = async (roomId) => {
  // This should query your database for room information
  // For now, returning mock data
  return {
    id: roomId,
    type: 'public', // or 'private'
    name: `Room ${roomId}`,
    createdAt: new Date(),
    settings: {
      allowAnonymous: true,
      defaultPermission: 'edit' // 'view', 'edit', or 'owner'
    }
  };
};

// Get user permissions for a room
const getUserPermissions = async (roomId, username) => {
  // This should query your database for user permissions
  // For now, returning default permissions
  const roomInfo = await getRoomInfo(roomId);
  
  // Mock logic - replace with actual permission checking
  if (username === 'owner') return 'owner';
  if (username === 'viewer') return 'view';
  
  return roomInfo.settings.defaultPermission || 'edit';
};

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected');
  server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
  });
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Handle joining a room with username
  socket.on('join-room', async (data) => {
    const { room, username } = data;
    
    try {
      // Get room info and user permissions
      const roomInfo = await getRoomInfo(room);
      const userPermissions = await getUserPermissions(room, username);
      
      // Leave any previous rooms
      Array.from(socket.rooms).forEach(roomName => {
        if (roomName !== socket.id) {
          socket.leave(roomName);
          
          // Remove user from previous room's active users
          if (activeRooms.has(roomName)) {
            const roomUsers = activeRooms.get(roomName);
            const leavingUser = roomUsers.find(user => user.socketId === socket.id);
            const updatedUsers = roomUsers.filter(user => user.socketId !== socket.id);
            
            if (updatedUsers.length === 0) {
              activeRooms.delete(roomName);
            } else {
              activeRooms.set(roomName, updatedUsers);
            }
            
            // Notify others in the previous room
            if (leavingUser) {
              socket.to(roomName).emit('user-left', { 
                username: leavingUser.username, 
                activeUsers: updatedUsers.length,
                users: updatedUsers.map(user => ({ 
                  username: user.username, 
                  permission: user.permission 
                }))
              });
            }
          }
        }
      });

      // Join the new room
      socket.join(room);
      socket.room = room;
      socket.username = username;
      socket.userPermissions = userPermissions;

      // Add user to active room tracking
      if (!activeRooms.has(room)) {
        activeRooms.set(room, []);
      }
      
      const roomUsers = activeRooms.get(room);
      const existingUserIndex = roomUsers.findIndex(user => user.socketId === socket.id);
      
      const userData = {
        socketId: socket.id,
        username: username,
        permission: userPermissions,
        joinedAt: new Date()
      };

      if (existingUserIndex === -1) {
        roomUsers.push(userData);
      } else {
        // Update existing user info
        roomUsers[existingUserIndex] = userData;
      }

      console.log(`User ${username} (${socket.id}) joined room ${room} with ${userPermissions} permissions`);
      console.log(`Room ${room} now has ${roomUsers.length} users`);

      // Notify others in the room about the new user
      socket.to(room).emit('user-joined', { 
        username: username,
        activeUsers: roomUsers.length,
        users: roomUsers.map(user => ({ 
          username: user.username, 
          permission: user.permission 
        }))
      });

      // Send current room info to the joining user
      socket.emit('room-joined', {
        room: room,
        activeUsers: roomUsers.length,
        users: roomUsers.map(user => ({ 
          username: user.username, 
          permission: user.permission 
        })),
        roomInfo: roomInfo,
        userPermissions: userPermissions
      });

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('join-error', { message: 'Failed to join room' });
    }
  });

  // Handle drawing events - check permissions
  socket.on('drawing', (data) => {
    if (socket.room && data.room === socket.room) {
      // Check if user has edit permissions
      if (socket.userPermissions === 'view') {
        socket.emit('permission-denied', { 
          action: 'drawing',
          message: 'You do not have permission to draw on this whiteboard'
        });
        return;
      }

      // Broadcast drawing data to all other users in the room
      socket.to(data.room).emit('drawing', {
        ...data,
        userId: socket.id,
        username: socket.username,
        timestamp: Date.now()
      });

      console.log(`Drawing event in room ${data.room} by ${socket.username} (${data.tool})`);
    }
  });

  // Handle canvas clear - check permissions
  socket.on('canvas-clear', (data) => {
    if (socket.room && data.room === socket.room) {
      // Check if user has edit permissions
      if (socket.userPermissions === 'view') {
        socket.emit('permission-denied', { 
          action: 'canvas-clear',
          message: 'You do not have permission to clear this whiteboard'
        });
        return;
      }

      console.log(`Canvas cleared in room ${data.room} by ${socket.username}`);
      socket.to(data.room).emit('canvas-clear', {
        room: data.room,
        clearedBy: socket.username,
        timestamp: Date.now()
      });
    }
  });

  // Handle permission updates (for room owners/admins)
  socket.on('update-user-permission', async (data) => {
    const { room, targetUsername, newPermission } = data;
    
    if (socket.room !== room || socket.userPermissions !== 'owner') {
      socket.emit('permission-denied', { 
        action: 'update-permission',
        message: 'You do not have permission to change user permissions'
      });
      return;
    }

    // Update permissions in database (implement this)
    // For now, just update in memory
    if (activeRooms.has(room)) {
      const roomUsers = activeRooms.get(room);
      const targetUser = roomUsers.find(user => user.username === targetUsername);
      
      if (targetUser) {
        targetUser.permission = newPermission;
        
        // Find the target user's socket and update their permissions
        const targetSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.username === targetUsername && s.room === room);
        
        if (targetSocket) {
          targetSocket.userPermissions = newPermission;
          targetSocket.emit('permission-updated', {
            username: targetUsername,
            permission: newPermission,
            updatedBy: socket.username
          });
        }

        // Notify all users in the room about the permission change
        io.to(room).emit('user-permission-changed', {
          username: targetUsername,
          newPermission: newPermission,
          updatedBy: socket.username,
          users: roomUsers.map(user => ({ 
            username: user.username, 
            permission: user.permission 
          }))
        });

        console.log(`Permission updated for ${targetUsername} in room ${room}: ${newPermission}`);
      }
    }
  });

  // Handle cursor position updates (optional feature)
  socket.on('cursor-move', (data) => {
    if (socket.room && data.room === socket.room) {
      socket.to(data.room).emit('cursor-move', {
        ...data,
        userId: socket.id,
        username: socket.username
      });
    }
  });

  // Handle text input events - check permissions
  socket.on('text-input', (data) => {
    if (socket.room && data.room === socket.room) {
      // Check if user has edit permissions
      if (socket.userPermissions === 'view') {
        socket.emit('permission-denied', { 
          action: 'text-input',
          message: 'You do not have permission to add text to this whiteboard'
        });
        return;
      }

      socket.to(data.room).emit('text-input', {
        ...data,
        userId: socket.id,
        username: socket.username,
        timestamp: Date.now()
      });
    }
  });

  // Handle chat messages (if you want to add chat functionality)
  socket.on('chat-message', (data) => {
    if (socket.room && data.room === socket.room) {
      const messageData = {
        message: data.message,
        username: socket.username,
        userId: socket.id,
        timestamp: Date.now(),
        room: data.room
      };
      
      // Send to all users in the room including sender
      io.to(data.room).emit('chat-message', messageData);
      console.log(`Chat message in room ${data.room} from ${socket.username}: ${data.message}`);
    }
  });

  // Handle room info requests
  socket.on('get-room-info', async (data) => {
    try {
      const roomInfo = await getRoomInfo(data.room);
      socket.emit('room-info', roomInfo);
    } catch (error) {
      socket.emit('room-info-error', { message: 'Failed to get room information' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (socket.room && socket.username) {
      // Remove user from active room tracking
      if (activeRooms.has(socket.room)) {
        const roomUsers = activeRooms.get(socket.room);
        const updatedUsers = roomUsers.filter(user => user.socketId !== socket.id);
        
        if (updatedUsers.length === 0) {
          activeRooms.delete(socket.room);
          console.log(`Room ${socket.room} is now empty and removed`);
        } else {
          activeRooms.set(socket.room, updatedUsers);
        }

        // Notify others in the room
        socket.to(socket.room).emit('user-left', { 
          username: socket.username,
          activeUsers: updatedUsers.length,
          users: updatedUsers.map(user => ({ 
            username: user.username, 
            permission: user.permission 
          }))
        });

        console.log(`User ${socket.username} left room ${socket.room}`);
      }
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// API endpoint to get room info (optional, for REST API access)
app.get('/api/room/:roomId/info', async (req, res) => {
  try {
    const roomInfo = await getRoomInfo(req.params.roomId);
    const activeUsers = activeRooms.get(req.params.roomId) || [];
    
    res.json({
      ...roomInfo,
      activeUsers: activeUsers.length,
      users: activeUsers.map(user => ({ 
        username: user.username, 
        permission: user.permission,
        joinedAt: user.joinedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get room information' });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});