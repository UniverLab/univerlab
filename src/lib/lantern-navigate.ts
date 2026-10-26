/** Should a click on the lantern's screen open the experiment it projects?
 *
 *  Pure decision shared by the home's `#catch` click handler and its tests:
 *  the DOM state (projection, world open, pointer deltas) is gathered by the
 *  caller, this only answers. The three refusals, in order:
 *
 *  - the title slide projects no experiment, so there is nothing to open;
 *  - a pointer that travelled more than the threshold is a drag, and worlds
 *    that react to dragging must keep it (a click never follows a drag);
 *  - a touch whose world is still closed is the first tap: it keeps today's
 *    behaviour and opens the world instead of navigating. A tap while the
 *    world is already open navigates, like a plain mouse click.
 *
 *  Keyboard and screen readers never reach this: the screen is aria-hidden
 *  and not focusable, the plates remain the keyboard path.
 */

/** Pointer travel (px) between pointerdown and pointerup that still counts
 *  as a click: up to and including it navigates, beyond it is a drag. */
export const SCREEN_DRAG_PX = 6;

export function shouldScreenNavigate(input: {
  /** `#screen`'s `data-current-exp`: the projected experiment, "" on the title slide. */
  currentExp: string;
  /** Pointer travel X since pointerdown (px). */
  dx: number;
  /** Pointer travel Y since pointerdown (px). */
  dy: number;
  /** The pointerType recorded on pointerdown (mouse | touch | pen). */
  pointerType: string;
  /** Whether a world was open when the gesture started. */
  worldOpen: boolean;
}): boolean {
  const { currentExp, dx, dy, pointerType, worldOpen } = input;
  if (!currentExp) return false;
  if (Math.hypot(dx, dy) > SCREEN_DRAG_PX) return false;
  if (pointerType === 'touch' && !worldOpen) return false;
  return true;
}
