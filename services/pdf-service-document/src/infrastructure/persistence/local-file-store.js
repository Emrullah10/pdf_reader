import { unlink } from 'node:fs/promises';

export const makeLocalFileStore = () => ({
  async remove(path) {
    await unlink(path);
  },
});
