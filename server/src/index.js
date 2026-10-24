const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');
const { Setting } = require('./models');
const { setupCompany } = require('./services/people');

(async () => {
  await mongoose.connect(config.mongo);
  // First run: optionally create the Admin from ADMIN_EMAIL / ADMIN_PASSWORD, otherwise the web app shows the setup screen.
  if (config.admin.email && config.admin.password && !(await Setting.findOne({ setupDone: true }))) {
    await setupCompany({ company: config.admin.company, name: 'Admin', email: config.admin.email, password: config.admin.password });
    console.log('First run: Admin created from env');
  }
  app.listen(config.port, () => console.log('HCM Lite API on :' + config.port));
})().catch((e) => { console.error(e); process.exit(1); });
