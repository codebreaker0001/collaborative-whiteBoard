import React, { useState } from 'react';
import { createRoom, joinRoom } from '../api';

export default function RoomForm({ token, onJoin }) {
  const [room, setRoom] = useState('');
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState('create');
  const [roomType, setRoomType] = useState('collaborative'); // collaborative or presentation
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!room.trim()) {
      setError('Room name is required');
      return;
    }
    
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setIsLoading(true);
    
    try {
      let res;
      if (mode === 'create') {
        res = await createRoom(room.trim(), token, { 
          type: roomType,
          creator: username.trim()
        });
      } else {
        res = await joinRoom(room.trim(), token, username.trim());
      }
      
      if (res.room) {
        // Pass room data to parent component
        onJoin({
          room: res.room.name,
          username: username.trim(),
          userPermissions: res.userPermissions || (mode === 'create' ? 'owner' : 'edit'),
          roomInfo: res.room
        });
      } else {
        setError(res.error || 'Failed to ' + mode + ' room');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Room operation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '400px',
      margin: '50px auto',
      padding: '30px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      backgroundColor: 'white',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
        {mode === 'create' ? 'Create Whiteboard Room' : 'Join Whiteboard Room'}
      </h2>
      
      {error && (
        <div style={{
          color: '#dc3545',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '15px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
            Your Username:
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username"
            required
            maxLength={20}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
            Room Name:
          </label>
          <input
            type="text"
            value={room}
            onChange={e => setRoom(e.target.value)}
            placeholder="Enter room name"
            required
            maxLength={30}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {mode === 'create' && (
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
              Room Type:
            </label>
            <select
              value={roomType}
              onChange={e => setRoomType(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="collaborative">Collaborative (Everyone can edit)</option>
              <option value="presentation">Presentation (Only owner can edit)</option>
            </select>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block' }}>
              {roomType === 'collaborative' 
                ? 'All participants can draw and edit the whiteboard'
                : 'Only the room creator can edit, others can only view'
              }
            </small>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '12px',
            backgroundColor: isLoading ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginTop: '10px'
          }}
        >
          {isLoading 
            ? (mode === 'create' ? 'Creating...' : 'Joining...') 
            : (mode === 'create' ? '🎨 Create Room' : '🚪 Join Room')
          }
        </button>

        <p 
          onClick={() => {
            if (!isLoading) {
              setMode(mode === 'create' ? 'join' : 'create');
              setError('');
              setRoomType('collaborative');
            }
          }}
          style={{ 
            cursor: isLoading ? 'not-allowed' : 'pointer', 
            color: isLoading ? '#6c757d' : '#007bff',
            textAlign: 'center',
            textDecoration: 'underline',
            margin: '10px 0 0 0',
            fontSize: '14px'
          }}
        >
          {mode === 'create' 
            ? 'Already have a room? Join instead' 
            : 'Need to create a new room? Create instead'
          }
        </p>
      </form>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '14px' }}>Quick Tips:</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6c757d' }}>
          <li>Room names are case-sensitive</li>
          <li>Share the room name with others to collaborate</li>
          <li>Your drawings sync in real-time with other participants</li>
          <li>Use the share button in the whiteboard to get a direct link</li>
        </ul>
      </div>
    </div>
  );
}