import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/dev-login', (req, res) => {
  const user = { id: '507f1f77bcf86cd799439011', username: 'DevUser' };
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user });
});

export default router;
