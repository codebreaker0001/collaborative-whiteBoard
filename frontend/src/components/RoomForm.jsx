import React, { useState } from 'react';
import { createRoom, joinRoom } from '../api';

export default function RoomForm({ token, onJoin }) {
  const [room, setRoom] = useState('');
  const [mode, setMode] = useState('create');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = mode === 'create' ? await createRoom(room, token) : await joinRoom(room, token);
    if (res.room) onJoin(res.room.name);
    else alert(res.error);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>{mode === 'create' ? 'Create Room' : 'Join Room'}</h2>
      <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Room name" />
      <button>{mode === 'create' ? 'Create' : 'Join'}</button>
      <p onClick={() => setMode(mode === 'create' ? 'join' : 'create')} style={{ cursor: 'pointer', color: 'blue' }}>
        Switch to {mode === 'create' ? 'Join' : 'Create'}
      </p>
    </form>
  );
}
