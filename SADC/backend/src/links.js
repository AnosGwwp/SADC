// Saves who linked which wallet to data/links.json, one entry per Discord account:
//   { discord_id, username, name, wallet, held, holds, linked_at, checked_at }
// One Discord account has at most one wallet and one wallet belongs to at most one Discord account,
// so nobody can use the same NFT for several accounts.
//
// Emits 'holders' with the holder list for the bot (see snapshot()), after it's saved and only when it changes:
// someone verified, unlinked, sold, bought, or holds a different number of NFTs.

import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';

export class LinkStore extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, 'links.json');
    this.links = {};
    this.writing = Promise.resolve();
    this.lastHolders = '';
  }

  async load() {
    try {
      this.links = JSON.parse(await fs.readFile(this.file, 'utf8')).links ?? {};
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Can't read ${this.file}: ${err.message}. Fix or delete it, then start again.`);
    }
    this.lastHolders = JSON.stringify(this.snapshot());
  }

  get(discordId) {
    return this.links[discordId] ?? null;
  }

  byWallet(wallet) {
    return Object.values(this.links).find((link) => link.wallet === wallet) ?? null;
  }

  all() {
    return Object.values(this.links);
  }

  // The Discord ids that should have the holder role.
  holders() {
    return this.all().filter((link) => link.holds).map((link) => link.discord_id).sort();
  }

  // What the bot gets: the holders, and how many NFTs each holds (for roles that need a certain amount).
  snapshot() {
    const holders = this.holders();
    return { holders, counts: Object.fromEntries(holders.map((id) => [id, this.links[id].held])) };
  }

  async set(link) {
    this.links[link.discord_id] = link;
    await this.save();
  }

  async remove(discordId) {
    delete this.links[discordId];
    await this.save();
  }

  // Writes the file (one write at a time, in order), then tells the bot if the holder list changed.
  // Throws if the file can't be written, so the website shows an error instead of a link that isn't saved.
  save() {
    const json = JSON.stringify({ links: this.links }, null, 1);
    const write = this.writing.then(async () => {
      // Temp file first, then rename over the real one, so a crash mid-write can't leave a broken file.
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(tmp, json);
      await fs.rename(tmp, this.file);
    });
    this.writing = write.catch(() => {});
    return write.then(() => {
      const snapshot = this.snapshot();
      const key = JSON.stringify(snapshot);
      if (key !== this.lastHolders) {
        this.lastHolders = key;
        this.emit('holders', snapshot);
      }
    });
  }
}
