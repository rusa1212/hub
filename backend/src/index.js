import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import sessionRouter from './routes/session.js';
import chatRouter from './routes/chat.js';
import sttRouter from './routes/stt.js';
import ttsRouter from './routes/tts.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/session', sessionRouter);
app.use('/api/chat', chatRouter);
app.use('/api/stt', sttRouter);
app.use('/api/tts', ttsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`AirPods Log backend listening on http://localhost:${PORT}`);
});
