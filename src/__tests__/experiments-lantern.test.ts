/**
 * /experiments is the projection room: the lantern and its bench, with the
 * Plate I caption, under a header naming the room. The encyclopedia lives on
 * the home now.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const PAGE = readFileSync(resolve(__dirname, '../views/Experiments.astro'), 'utf8');

describe('the experiments page is the projection room', () => {
  it('renders the lantern under the room header', () => {
    expect(PAGE).toContain('<LabLantern />');
    expect(PAGE).toContain('room.head');
    expect(PAGE).toContain('<Postcard page="experiments"');
    expect(PAGE).toContain('{t.home.plate.lead}');
    expect(PAGE).toContain('{t.home.plate.title}');
    expect(PAGE).not.toContain('<Encyclopedia');
  });
});

describe('both dictionaries carry the projection room', () => {
  it('keys rooms the same in both languages', () => {
    for (const dict of [en, es]) {
      expect(Object.keys(dict.lanternRoom)).toEqual(['title', 'description', 'head', 'intro']);
    }
  });

  it('keeps the title and description inside the SEO window', () => {
    for (const dict of [en, es]) {
      expect(dict.lanternRoom.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.lanternRoom.title.length).toBeLessThanOrEqual(90);
      expect(dict.lanternRoom.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.lanternRoom.description.length).toBeLessThanOrEqual(160);
    }
  });
});
