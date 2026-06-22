/**
 * Dispatches a custom-notify event to display a custom clean visual toast.
 * @param {string} message - Message to display
 * @param {'success' | 'error' | 'warning' | 'info'} type - Toast theme
 */
export function showToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('custom-notify', { detail: { message, type } }));
}
