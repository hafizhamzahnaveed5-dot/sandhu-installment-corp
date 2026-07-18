/**
 * Vercel serverless entry — Express API backed by Neon.
 * All /api/* requests are rewritten here (see vercel.json).
 */
import { createApp } from '../backend/src/app.js';

export default createApp();
