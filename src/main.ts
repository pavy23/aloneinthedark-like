import './ui/styles.css';
import { Game } from './game/Game';

// When the page is hosted somewhere that supports live updates (a `hot` hook on window.claude),
// hand our progress across the reload; otherwise just boot normally.
interface Hot {
  ready?: (start: (data: { state?: unknown }) => void) => void;
  snapshot?: (fn: () => unknown) => void;
  data?: { state?: unknown };
}
const hot: Hot | undefined = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function boot(data: { state?: unknown } = {}): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');
  const game = new Game(app);
  game.start(data?.state);
  try {
    hot?.snapshot?.(() => ({ state: game.snapshot() }));
  } catch {
    /* host without live-update support */
  }
}

if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
