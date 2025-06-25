const BASE_URL = 'https://collaborative-whiteboard.up.railway.app/api';

export const signup = async (email, username, password) => {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  return res.json();
};

export const login = async (username, password) => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
};
export const createRoom = async (name, token, { type, creator }) => {
  const res = await fetch(`${BASE_URL}/room/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, type, creator })
  });
  return await res.json();
};

// joinRoom
export const joinRoom = async (name, token, username) => {
  const res = await fetch(`${BASE_URL}/room/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, username })
  });
  return await res.json();
};