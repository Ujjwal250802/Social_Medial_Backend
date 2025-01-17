import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from './models/Admin.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const initializeAdmin = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ username: 'admin@gmail.com' });
    
    if (!existingAdmin) {
      // Directly store the plaintext password
      const admin = new Admin({
        username: 'admin@gmail.com',
        password: 'admin' // Storing password as plaintext
      });
      
      await admin.save();
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

initializeAdmin();
