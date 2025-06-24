import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const createToken = (user) =>
  jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1d'
  });

// SIGNUP - email, username, password
export const signup = async (req, res) => {
  const { email, username, password } = req.body;
  try {
    const emailExists = await User.findOne({ email });
    const usernameExists = await User.findOne({ username });

    if (emailExists) return res.status(400).json({ error: 'Email already registered' });
    if (usernameExists) return res.status(400).json({ error: 'Username already taken' });

    const user = await User.create({ email, username, password });
    const token = createToken(user);
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGIN - username, password
export const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });

    const token = createToken(user);
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
