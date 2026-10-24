const { Audit, Notification, User } = require('../models');
const clean = (o) => { if (!o) return o; const j = JSON.parse(JSON.stringify(o.toObject ? o.toObject() : o)); delete j.password; return j; };
const audit = (req, action, entity, entityId, before, after) =>
  Audit.create({ actor: req.user._id, actorName: `${req.user.name} (${req.user.role})`, action, entity, entityId: String(entityId || ''), before: clean(before), after: clean(after) });
const notify = (userIds, text) => Notification.insertMany([].concat(userIds).filter(Boolean).map((u) => ({ user: u, text })));
const notifyRoles = async (roles, text) => notify((await User.find({ role: { $in: roles }, active: true }).select('_id')).map((u) => u._id), text);
module.exports = { audit, notify, notifyRoles };
