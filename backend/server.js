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
const io = new SocketIO(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

// Store active users in rooms
const activeRooms = new Map();

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
  socket.on('join-room', (data) => {
    const { room, username } = data;
    
    // Leave any previous rooms
    Array.from(socket.rooms).forEach(roomName => {
      if (roomName !== socket.id) {
        socket.leave(roomName);
        
        // Remove user from previous room's active users
        if (activeRooms.has(roomName)) {
          const roomUsers = activeRooms.get(roomName);
          const updatedUsers = roomUsers.filter(user => user.socketId !== socket.id);
          
          if (updatedUsers.length === 0) {
            activeRooms.delete(roomName);
          } else {
            activeRooms.set(roomName, updatedUsers);
          }
          
          // Notify others in the previous room
          socket.to(roomName).emit('user-left', { 
            username: socket.username, 
            activeUsers: updatedUsers.length 
          });
        }
      }
    });

    // Join the new room
    socket.join(room);
    socket.room = room;
    socket.username = username;

    // Add user to active room tracking
    if (!activeRooms.has(room)) {
      activeRooms.set(room, []);
    }
    
    const roomUsers = activeRooms.get(room);
    const existingUserIndex = roomUsers.findIndex(user => user.socketId === socket.id);
    
    if (existingUserIndex === -1) {
      roomUsers.push({
        socketId: socket.id,
        username: username,
        joinedAt: new Date()
      });
    } else {
      // Update existing user info
      roomUsers[existingUserIndex].username = username;
    }

    console.log(`User ${username} (${socket.id}) joined room ${room}`);
    console.log(`Room ${room} now has ${roomUsers.length} users`);

    // Notify others in the room about the new user
    socket.to(room).emit('user-joined', { 
      username: username,
      activeUsers: roomUsers.length
    });

    // Send current room info to the joining user
    socket.emit('room-joined', {
      room: room,
      activeUsers: roomUsers.length,
      users: roomUsers.map(user => ({ username: user.username }))
    });
  });

  // Handle drawing events
  socket.on('drawing', (data) => {
    if (socket.room && data.room === socket.room) {
      // Broadcast drawing data to all other users in the room
      socket.to(data.room).emit('drawing', {
        ...data,
        userId: socket.id,
        username: socket.username,
        timestamp: Date.now()
      });
    }
  });

  // Handle canvas clear
  socket.on('canvas-clear', (data) => {
    if (socket.room && data.room === socket.room) {
      console.log(`Canvas cleared in room ${data.room} by ${socket.username}`);
      socket.to(data.room).emit('canvas-clear', {
        room: data.room,
        clearedBy: socket.username,
        timestamp: Date.now()
      });
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

  // Handle text input events
  socket.on('text-input', (data) => {
    if (socket.room && data.room === socket.room) {
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
          activeUsers: updatedUsers.length
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