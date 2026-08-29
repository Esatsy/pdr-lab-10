import { createRoot } from 'react-dom/client';
import Home from './app/page';
import './app/globals.css';
import './github-pages.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('GitHub Pages root element was not found.');
}

createRoot(root).render(<Home />);
