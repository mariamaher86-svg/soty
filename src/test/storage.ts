// localStorage that can fill up: after `quota(true)` every write throws QuotaExceededError, like a full phone.

const realSetItem = Storage.prototype.setItem;

export const storageControl = {
  full: false,
  quota(on: boolean) {
    this.full = on;
  },
  reset() {
    this.full = false;
  },
};

Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
  if (storageControl.full) throw new DOMException('full', 'QuotaExceededError');
  return realSetItem.call(this, k, v);
};
