import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';

import User from './models/User.js';
import Admin from './models/Admin.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Multer configuration
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    
    if (!admin) {
      throw new Error();
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

// User authentication middleware
const userAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      throw new Error();
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

// Initialize admin if not exists
const initializeAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({ username: 'admin@gmail.com' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      const admin = new Admin({
        username: 'admin@gmail.com',
        password: hashedPassword
      });
      await admin.save();
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// User Routes
app.post('/api/users/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = new User({
      email,
      password,
      name,
      socialHandles: [],
      images: []
    });

    await user.save();
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Data Routes
app.post('/api/users/upload', userAuth, upload.array('images', 5), async (req, res) => {
  try {
    const { platform, handle } = req.body;
    const images = req.files ? req.files.map(file => ({
      url: `/uploads/${file.filename}`,
      uploadedAt: new Date()
    })) : [];
    
    const user = req.user;
    
    // Add new social handle if provided
    if (platform && handle) {
      // Initialize socialHandles array if it doesn't exist
      if (!user.socialHandles) {
        user.socialHandles = [];
      }

      // Check if this platform already exists for the user
      const existingHandleIndex = user.socialHandles.findIndex(h => h.platform === platform);
      
      if (existingHandleIndex === -1) {
        // Add new platform
        user.socialHandles.push({
          platform,
          handle,
          addedAt: new Date()
        });
      } else {
        // Update existing platform
        user.socialHandles[existingHandleIndex].handle = handle;
        user.socialHandles[existingHandleIndex].addedAt = new Date();
      }
    }
    
    // Add new images if any
    if (images.length > 0) {
      if (!user.images) {
        user.images = [];
      }
      user.images.push(...images);
    }
    
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users', auth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete associated image files
    if (user.images && user.images.length > 0) {
      for (const image of user.images) {
        const fullPath = path.join(__dirname, '..', image.url);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id/images', auth, async (req, res) => {
  try {
    const { imagePath } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove image from user's images array
    user.images = user.images.filter(img => img.url !== imagePath);
    await user.save();

    // Delete the image file
    const fullPath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id/social-handles', auth, async (req, res) => {
  try {
    const { platform } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove social handle
    if (user.socialHandles) {
      user.socialHandles = user.socialHandles.filter(handle => handle.platform !== platform);
      await user.save();
    }

    res.json({ message: 'Social handle deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

// Initialize admin and start server
mongoose.connection.once('open', async () => {
  await initializeAdmin();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

export default app;