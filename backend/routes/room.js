import express from 'express';
import Room from '../models/Room.js';
import auth from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', auth, async (req, res) => {
  const { name } = req.body;
  try {
    const room = await Room.create({ name, members: [req.user.id] });
    res.json({ room });
  } catch {
    res.status(400).json({ error: 'Room already exists' });
  }
});

router.post('/join', auth, async (req, res) => {
  const { name } = req.body;
  try {
    const room = await Room.findOne({ name });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.members.includes(req.user.id)) {
      room.members.push(req.user.id);
      await room.save();
    }

    res.json({ room });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
