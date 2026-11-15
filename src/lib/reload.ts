// The one way the app reloads the page (after restoring a backup, switching girl/boy, an update…).
// Kept in one object so tests can watch it: jsdom can't really reload.

export const browser = {
  reload() {
    window.location.reload();
  },
};
