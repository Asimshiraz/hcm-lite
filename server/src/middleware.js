const jwt = require('jsonwebtoken');
const config = require('./config');
const { User } = require('./models');
const { HttpError } = require('./utils');

const auth = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Login required');
    let p;
    try { p = jwt.verify(h.slice(7), config.jwt); } catch { throw new HttpError(401, 'Session expired'); }
    const u = await User.findById(p.id);
    if (!u || !u.active) throw new HttpError(401, 'Account disabled or not found');
    if (u.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) throw new HttpError(403, 'Change your temporary password first', { code: 'PASSWORD_CHANGE_REQUIRED' });
    req.user = u;
    next();
  } catch (e) { next(e); }
};
const allow = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this')));
const errorHandler = (err, req, res, next) => { // eslint-disable-line
  if (err.name === 'ValidationError') err = new HttpError(422, Object.values(err.errors).map((e) => e.message).join('; '));
  if (err.code === 11000) err = new HttpError(409, 'Duplicate value: ' + Object.keys(err.keyPattern || {}).join(', '));
  if (err.name === 'CastError') err = new HttpError(422, 'Invalid ' + err.path);
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Server error' : err.message, ...(err.extra || {}) });
};
module.exports = { auth, allow, errorHandler };
