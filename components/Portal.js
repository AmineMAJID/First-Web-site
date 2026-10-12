'use client';

import { createPortal } from 'react-dom';

// Renders its children directly under <body>. Fixed overlays (modals, confirmations) must not be
// nested inside animated page wrappers: a CSS transform there would make "position: fixed"
// relative to that wrapper instead of the browser window, and the dialog would be misplaced.
export default function Portal({ children }) {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
}
