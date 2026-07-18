import { createApp } from './app.js';
import { config } from './config.js';
import { scheduleDailySmsSweep } from './services/sms.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
  // Local/Railway long-running process only — skipped automatically on Vercel
  scheduleDailySmsSweep();
});
