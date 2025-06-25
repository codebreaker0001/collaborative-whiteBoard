#  Real-Time Collaborative Whiteboard

A real-time collaborative whiteboard web application built with **React**, **Node.js**, **Socket.IO**, and **MongoDB**. Users can create or join rooms, collaborate with others live, and draw on a shared canvas with different permissions.

---

##  Features

-  User Signup/Login with JWT authentication  
-  Create or Join Whiteboard Rooms  
-  Real-time collaborative drawing using WebSockets (Socket.IO)  
-  Role-based permissions:
  - **Owner** – full control (edit/delete/manage permissions)
  - **Editor** – can draw and collaborate
  - **Viewer** – read-only access  
-  Room types:
  - **Collaborative** – everyone can draw
  - **Presentation** – only owner can draw
-  Live synchronization of drawings between users
-  Clean, responsive UI

---

##  Tech Stack

### Frontend
- React.js
- React Router
- CSS Modules

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- Socket.IO

---
### Setup Backend
cd server
npm install
 
### create .env
PORT=3000
MONGO_URI=mongodb://localhost:27017/whiteboard
JWT_SECRET=your_secret_key

### start backend
npm run dev

### Setup frontend
cd ../client
npm install

### start frontend
npm run dev 

Frontend runs at http://localhost:5173

## Author - @codebreaker0001



