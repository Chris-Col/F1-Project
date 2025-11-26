// middleware/requireAuth.js
import jwt from 'jsonwebtoken';
export default function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const uid = payload.sub || payload.id || payload._id;
    if (!uid) return res.status(401).json({ error: 'Invalid token' });
    req.user = { id: uid, username: payload.username || payload.name };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}



