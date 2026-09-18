interface ToastOptions {
  duration?: number;
}

type ToastType = 'success' | 'error' | 'info';

interface ToastInstance {
  (message: string, options?: ToastOptions): void;
  success(message: string, options?: ToastOptions): void;
  error(message: string, options?: ToastOptions): void;
  info(message: string, options?: ToastOptions): void;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let container: HTMLDivElement | null = null;
const toasts: ToastItem[] = [];
let toastId = 0;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  container = document.createElement('div');
  container.className =
    'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
  document.body.appendChild(container);
  return container;
}

function typeClass(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-white text-[#52C41A] border-l-4 border-[#52C41A]';
    case 'error':
      return 'bg-white text-[#FF4D4F] border-l-4 border-[#FF4D4F]';
    case 'info':
      return 'bg-white text-[#36BFFA] border-l-4 border-[#36BFFA]';
  }
}

function iconFor(type: ToastType): string {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'info':
      return 'ⓘ';
  }
}

function show(message: string, type: ToastType, options: ToastOptions = {}): void {
  const { duration = 3000 } = options;
  const c = ensureContainer();
  const id = ++toastId;

  const el = document.createElement('div');
  el.className = [
    'pointer-events-auto',
    'flex items-center gap-2',
    'px-4 py-3',
    'rounded-xl shadow-lg',
    'text-sm font-medium',
    'transition-all duration-300',
    'translate-x-full opacity-0',
    'min-w-[200px] max-w-[360px]',
    typeClass(type),
  ].join(' ');

  const icon = document.createElement('span');
  icon.className = 'text-lg';
  icon.textContent = iconFor(type);
  el.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'flex-1 whitespace-pre-line break-words';
  text.textContent = message;
  el.appendChild(text);

  c.appendChild(el);

  // Enter animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.remove('translate-x-full', 'opacity-0');
    });
  });

  const timer = window.setTimeout(() => {
    // Exit animation
    el.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      const idx = toasts.findIndex((t) => t.id === id);
      if (idx >= 0) toasts.splice(idx, 1);
      if (toasts.length === 0 && container && container.parentNode) {
        container.parentNode.removeChild(container);
        container = null;
      }
    }, 300);
    window.clearTimeout(timer);
  }, duration);

  toasts.push({ id, message, type });
}

export const toast: ToastInstance = ((
  message: string,
  options?: ToastOptions,
): void => {
  show(message, 'info', options);
}) as ToastInstance;

toast.success = (message: string, options?: ToastOptions): void => {
  show(message, 'success', options);
};

toast.error = (message: string, options?: ToastOptions): void => {
  show(message, 'error', options);
};

toast.info = (message: string, options?: ToastOptions): void => {
  show(message, 'info', options);
};
