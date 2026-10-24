require('dotenv').config();
module.exports = {
  port: process.env.PORT || 5000,
  mongo: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hcmlite',
  jwt: process.env.JWT_SECRET || 'dev-secret-change-me',
  tz: process.env.TZ_NAME || 'Asia/Karachi',
  origin: process.env.CLIENT_ORIGIN || '*',
  admin: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, company: process.env.COMPANY_NAME || 'My Company' },
  ai: { key: process.env.AI_API_KEY, base: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1', model: process.env.AI_MODEL || 'llama-3.3-70b-versatile' },
};
