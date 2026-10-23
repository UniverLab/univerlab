/** The entry list of /experiments — one row per registry experiment, in registry (EXP) order.
 *  Pure data: the view renders it, the jest test checks it. */
import { experiments, isArchived, type ExperimentId, type Status } from './experiments';

export interface EntryModel {
  id: ExperimentId;
  /** `exp-001` — the article id, and the anchor on /archive for archived entries. */
  anchor: string;
  status: Status;
  archived: boolean;
  /** Live → the experiment's own page; archived → its line on /archive. */
  href: string;
  /** Unix install command, if the experiment ships a binary. */
  install?: string;
}

/** `localize` maps a root path to the page's language (localizePath in the view). */
export function entryModels(localize: (path: string) => string): EntryModel[] {
  return experiments.map((exp) => {
    const archived = isArchived(exp);
    const anchor = exp.number.toLowerCase();
    return {
      id: exp.id,
      anchor,
      status: exp.status,
      archived,
      // The spec's literal form is /archive#exp-00n: strip the trailing slash localize adds.
      href: archived ? `${localize('/archive').replace(/\/$/, '')}#${anchor}` : localize(`/${exp.id}`),
      install: exp.install?.unix,
    };
  });
}
