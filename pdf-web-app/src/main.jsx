import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Container from '@container/Container';
import '@styles/index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Container />
  </StrictMode>,
);
