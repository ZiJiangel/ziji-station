/** 自定义确认框，替代浏览器原生 confirm() */

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'zj-dialog-mask';
    
    mask.innerHTML = `
      <div class="zj-dialog" role="dialog" aria-modal="true">
        <div class="zj-dialog-title">${opts.title || '确认'}</div>
        <div class="zj-dialog-body">${opts.message}</div>
        <div class="zj-dialog-actions">
          <button class="btn" data-act="cancel">${opts.cancelText || '取消'}</button>
          <button class="btn ${opts.danger ? 'danger' : 'primary'}" data-act="confirm">${opts.confirmText || '确定'}</button>
        </div>
      </div>
    `;

    const close = (result: boolean) => {
      mask.classList.remove('open');
      setTimeout(() => mask.remove(), 200);
      resolve(result);
    };

    mask.querySelector('[data-act="cancel"]')!.addEventListener('click', () => close(false));
    mask.querySelector('[data-act="confirm"]')!.addEventListener('click', () => close(true));
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close(false);
    });

    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('open'));
  });
}
