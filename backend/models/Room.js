import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  permission: {
    type: String,
    enum: ['owner', 'edit', 'view'],
    default: 'edit',
  }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['collaborative', 'presentation'],
    default: 'collaborative'
  },
  creator: { type: String, required: true }, // Store username or userId
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permissions: [permissionSchema],
  canvasData: { type: String, default: '' }
}, { timestamps: true });

const Room = mongoose.model('Room', roomSchema);
export default Room;


