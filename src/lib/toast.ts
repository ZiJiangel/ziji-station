type ToastKind = 'info' | 'success' | 'error';

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-stack';
  document.body.appendChild(container);
  return container;
}

export function toast(message: string, kind: ToastKind = 'info', duration = 2600) {
  const stack = ensureContainer();
  const el = document.createElement('div');
  el.className = 'toast toast--' + kind;
  el.textContent = message;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => {
    el.classList.remove('toast--in');
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export const toastSuccess = (m: string) => toast(m, 'success');
export const toastError = (m: string) => toast(m, 'error');
