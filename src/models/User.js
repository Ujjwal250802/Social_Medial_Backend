import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  socialHandles: [{
    platform: String,
    handle: String,
    addedAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  images: [{
    url: String,
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

export default mongoose.model('User', userSchema);