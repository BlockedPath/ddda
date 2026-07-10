/**
 * Soft HUD toast notifications (save / load / errors).
 */
export class ToastHost {
  private root: HTMLElement;
  private hideTimer = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'toast-host';
    this.root.setAttribute('aria-live', 'polite');
    container.appendChild(this.root);
  }

  show(
    message: string,
    kind: 'ok' | 'info' | 'err' = 'ok',
    ms = 2200,
  ): void {
    window.clearTimeout(this.hideTimer);
    this.root.replaceChildren();

    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `<span class="toast-icon" aria-hidden="true"></span><span class="toast-msg"></span>`;
    el.querySelector('.toast-msg')!.textContent = message;
    const icon = el.querySelector('.toast-icon')!;
    icon.textContent =
      kind === 'ok' ? '✓' : kind === 'err' ? '!' : '·';
    this.root.appendChild(el);

    // Retrigger enter animation
    requestAnimationFrame(() => el.classList.add('in'));

    this.hideTimer = window.setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      window.setTimeout(() => {
        if (el.parentElement === this.root) el.remove();
      }, 280);
    }, ms);
  }
}
