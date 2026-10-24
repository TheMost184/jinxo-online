import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameProvider } from './hooks/useGame';
// ฟอนต์ไทยแบบ self-host (ไม่พึ่ง Google Fonts โหลดเฉพาะ subset ที่ใช้จริง)
import '@fontsource/mitr/400.css';
import '@fontsource/mitr/500.css';
import '@fontsource/mitr/600.css';
import '@fontsource/ibm-plex-sans-thai-looped/400.css';
import '@fontsource/ibm-plex-sans-thai-looped/500.css';
import '@fontsource/ibm-plex-sans-thai-looped/600.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GameProvider>
        <App />
      </GameProvider>
    </ErrorBoundary>
  </StrictMode>,
);
