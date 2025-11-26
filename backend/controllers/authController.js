import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined. Check your .env file.');
}

// POST /api/register
export const register = async (req, res) => {
  const log = logger.withRequest(req);
  const { username, email, password } = req.body;
  log.info('Registration attempt', { username, email });

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      log.warn('Registration failed - email already in use', { email });
      return res.status(400).json({ message: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ username, email, password: hashedPassword });

    await newUser.save();
    log.info('User registered successfully', { userId: newUser._id, username });

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    log.error('Registration error', { error: err.message, stack: err.stack });
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// POST /api/login
export const login = async (req, res) => {
  const log = logger.withRequest(req);
  const { username, password } = req.body;
  log.info('Login attempt', { username });

  try {
    const user = await User.findOne({ username });
    if (!user) {
      log.warn('Login failed - user not found', { username });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      log.warn('Login failed - invalid password', { username });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), id: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    log.info('Login successful', { userId: user._id, username });
    res.status(200).json({ token, username: user.username });
  } catch (err) {
    log.error('Login error', { username, error: err.message, stack: err.stack });
    res.status(500).json({ message: 'Server error during login' });
  }
};

