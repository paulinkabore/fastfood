import { createServer } from 'node:http';
import { app } from '../backend/src/app';
import { initRealtime } from '../backend/src/lib/realtime';

// Vercel expose Express et Socket.IO dans la même fonction Node.js.
const server = createServer(app);
initRealtime(server);

export default server;
