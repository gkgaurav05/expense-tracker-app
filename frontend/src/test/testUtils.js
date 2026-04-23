import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mountedRoots = [];

export async function renderComponent(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(element);
  });

  return { container, root };
}

export async function flushPromises(times = 2) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export async function click(element) {
  await act(async () => {
    element.click();
  });
}

export async function submit(form) {
  await act(async () => {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });
}

export async function changeInput(element, value) {
  const inputPrototype = element.tagName === 'TEXTAREA'
    ? element.ownerDocument.defaultView.HTMLTextAreaElement.prototype
    : element.ownerDocument.defaultView.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(inputPrototype, 'value');

  await act(async () => {
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  });
}

export async function changeFileInput(element, file) {
  await act(async () => {
    Object.defineProperty(element, 'files', {
      configurable: true,
      value: [file],
    });
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function cleanup() {
  while (mountedRoots.length > 0) {
    const { root, container } = mountedRoots.pop();
    root.unmount();
    container.remove();
  }
}
