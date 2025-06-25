import React, { useState } from 'react';
import Login from './components/Login';
import Signup from './components/Signup';
import RoomForm from './components/RoomForm.jsx';
import Whiteboard from './components/Whiteboard';

import './components/auth.css';
import './components/roomForm.css';
import './components/Whiteboard.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [room, setRoom] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'

  const handleAuth = (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUsername);
  };

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    setRoom(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  // 👤 Not authenticated
  if (!token) {
    return authMode === 'login' ? (
      <>
        <Login onAuth={handleAuth} />
        <p style={{ textAlign: 'center' }}>
          No account?{' '}
          <span style={{ color: 'blue', cursor: 'pointer' }} onClick={() => setAuthMode('signup')}>
            Sign up
          </span>
        </p>
      </>
    ) : (
      <>
        <Signup onAuth={handleAuth} />
        <p style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <span style={{ color: 'blue', cursor: 'pointer' }} onClick={() => setAuthMode('login')}>
            Login
          </span>
        </p>
      </>
    );
  }

  // ✅ Authenticated but not in room
  if (!room) {
    return (
      <>
        <RoomForm token={token} onJoin={setRoom} />
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          Logged in as <b>{username}</b>.{' '}
          <span style={{ color: 'red', cursor: 'pointer' }} onClick={handleLogout}>
            Logout
          </span>
        </p>
      </>
    );
  }

  console.log(room);
  
  // 🖌️ In whiteboard
  return (
    <>
      <div style={{ position: 'absolute', top: 10, right: 20, zIndex: 1000 }}>
        
        <button onClick={handleLogout}>Logout</button>
      </div>
      <Whiteboard
        room={room.room}
        username={room.username}
        userPermissions={room.userPermissions}
        type ={room.type}
      />
    </>
  );
}

export default App;
