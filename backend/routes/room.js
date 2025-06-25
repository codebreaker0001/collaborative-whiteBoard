import express from 'express';
import Room from '../models/Room.js';
import auth from '../middleware/authMiddleware.js';
import User from '../models/User.js';
const router = express.Router();

router.post('/create', auth, async (req, res) => {
  const { name, type, creator } = req.body;
  console.log(creator);
  
  try {
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ error: 'Room name already taken' });
    }

    const user = await User.findOne({ username: creator });
    if (!user) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const room = new Room({
      name,
      type,
      creator,
      members: [user._id],
      permissions: [{ user: user._id, permission: 'owner' }]
    });

    await room.save();
    res.status(201).json({ room, userPermissions: 'owner' });

  } catch (err) {
    console.error('Create Room error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/join', auth, async (req, res) => {
  const { name, username } = req.body;
   console.log(username);
   
  try {
    const room = await Room.findOne({ name }).populate('permissions.user');
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingPermission = room.permissions.find(p => p.user.equals(user._id));

    if (!room.members.includes(user._id)) {
      room.members.push(user._id);
    }

    if (!existingPermission) {
      const defaultPermission = room.type === 'collaborative' ? 'edit' : 'view';
      room.permissions.push({ user: user._id, permission: defaultPermission });
    }

    await room.save();
    const userPerm = room.permissions.find(p => p.user.equals(user._id))?.permission;

    res.status(200).json({ room, userPermissions: userPerm });

  } catch (err) {
    console.error('Join Room error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
