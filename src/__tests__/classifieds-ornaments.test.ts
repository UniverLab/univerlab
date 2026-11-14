import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ORNAMENTS, ornamentImg, typeOrnament } from '../lib/classifieds-ornaments';

describe('typeOrnament', () => {
  it('maps launch and deploy to the launch cut', () => {
    expect(typeOrnament('launch')).toBe('launch');
    expect(typeOrnament('deploy')).toBe('launch');
  });

  it('maps update and bugfix to the update cut', () => {
    expect(typeOrnament('update')).toBe('update');
    expect(typeOrnament('bugfix')).toBe('update');
  });

  it('maps incident and note to their own cuts', () => {
    expect(typeOrnament('incident')).toBe('incident');
    expect(typeOrnament('note')).toBe('note');
  });

  it('leaves unknown types without a cut', () => {
    expect(typeOrnament('unknown')).toBeNull();
    expect(typeOrnament('')).toBeNull();
    expect(typeOrnament(null)).toBeNull();
    expect(typeOrnament(undefined)).toBeNull();
  });
});

describe('ornamentImg', () => {
  it('is decorative, lazy and sized', () => {
    const img = ornamentImg('head');
    expect(img).toContain('alt=""');
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('width="1200"');
    expect(img).toContain('height="451"');
    expect(img).toContain('src="/bench/classifieds/head.webp"');
  });

  it('carries the caller class when given', () => {
    expect(ornamentImg('manicule', 'manicule')).toContain('class="manicule"');
  });

  it('renders nothing for an unknown ornament', () => {
    expect(ornamentImg('nope')).toBe('');
  });
});

describe('ornament files', () => {
  it('exists on disk for every ornament', () => {
    for (const o of Object.values(ORNAMENTS)) {
      expect(existsSync(resolve(__dirname, '..', '..', 'public', o.src.replace(/^\//, '')))).toBe(true);
    }
  });
});
