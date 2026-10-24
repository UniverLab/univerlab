/** Engraved machine plates (public/bench/machines/) — the hero machine art.
 *
 *  Each experiment has the same machine as a clean engraved plate with a
 *  transparent ground, in a day ink and a night ink at 450 and 900 px tall
 *  (`{id}-{day|night}-{450|900}.{avif|webp}`, listed in
 *  public/bench/manifest.json). The hero shows the plate instead of the
 *  filtered bench clip, so no CSS filter or blend mode is ever needed: the
 *  plates are already inked for their ground.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Experiment } from './experiments';

export type MachineInk = 'day' | 'night';
export type MachineTheme = MachineInk | 'theme';

interface ManifestAsset {
  file: string;
  kind: string;
  experiment: string | null;
  variant: string | null;
  width: number;
  height: number;
}

let manifestCache: { assets: ManifestAsset[] } | null = null;

function loadManifest(): { assets: ManifestAsset[] } {
  if (!manifestCache) {
    manifestCache = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/bench/manifest.json'), 'utf8'),
    ) as { assets: ManifestAsset[] };
  }
  return manifestCache;
}

function machineFile(id: string, ink: MachineInk, px: 450 | 900, ext: 'avif' | 'webp'): ManifestAsset {
  const file = `machines/${id}-${ink}-${px}.${ext}`;
  const asset = loadManifest().assets.find((a) => a.kind === 'machine' && a.file === file);
  if (!asset) throw new Error(`Unknown machine plate: ${file}`);
  return asset;
}

export interface Plate {
  w: number;
  h: number;
}

/** Intrinsic box of a plate, from the 450 px WebP entry in the manifest. */
export function plate(id: string, ink: MachineInk): Plate {
  const asset = machineFile(id, ink, 450, 'webp');
  return { w: asset.width, h: asset.height };
}

/** AVIF/WebP srcset of the 450 and 900 variants, with manifest widths. */
export function srcsetFor(id: string, ink: MachineInk, ext: 'avif' | 'webp'): string {
  const small = machineFile(id, ink, 450, ext);
  const large = machineFile(id, ink, 900, ext);
  return (
    `/bench/${small.file} ${small.width}w, ` + `/bench/${large.file} ${large.width}w`
  );
}

/** Sizes derived from the plate's aspect ratio: 240 px tall from 40rem up. */
export function plateSizes(p: Plate): string {
  const wide = Math.round((240 * p.w) / p.h);
  const narrow = Math.round((150 * p.w) / p.h);
  return `(min-width: 40rem) ${wide}px, ${narrow}px`;
}

/** Which ink an experiment's hero plate takes. Circadian surfaces follow the
 *  bench theme; the light surfaces take the day ink; everything else — dark
 *  grounds, including the studio — takes the night ink. */
export function machineInk(exp: Pick<Experiment, 'surface' | 'circadian'>): MachineTheme {
  if (exp.circadian) return 'theme';
  if (exp.surface === 'paper' || exp.surface === 'blueprint' || exp.surface === 'pastel') {
    return 'day';
  }
  return 'night';
}
