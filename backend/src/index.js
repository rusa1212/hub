import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

// dev 스크립트를 어느 디렉터리(front/backend)에서 실행하든 항상 backend/.env를 읽도록
// 스크립트 파일 위치 기준 경로로 로드한다 (process.cwd() 기준이면 실행 위치에 따라 못 찾을 수 있음).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import sessionRouter from './routes/session.js';
import sessionsRouter from './routes/sessions.js';
import accountRouter from './routes/account.js';
import chatRouter from './routes/chat.js';
import sttRouter from './routes/stt.js';
import ttsRouter from './routes/tts.js';
import settingsRouter from './routes/settings.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/session', sessionRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/account', accountRouter);
app.use('/api/chat', chatRouter);
app.use('/api/stt', sttRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/settings', settingsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`AirPods Log backend listening on http://localhost:${PORT}`);
});
