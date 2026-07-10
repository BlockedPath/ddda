import './style.css';
import { App } from './app.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('#app missing');
}

root.innerHTML = `<div class="boot">Initializing physics lab…</div>`;

const app = new App(root);
app.start().catch((err) => {
  console.error(err);
  root.innerHTML = `<div class="boot error">Failed to start: ${String(err)}</div>`;
});
