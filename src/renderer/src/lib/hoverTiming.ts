// How long a hover has to last before the widget opens, and how long it has to
// end before the widget closes.
//
// ONE HOME, because there were two. Free mode's delay lived in WidgetDock and
// Notch mode's reveal band had none at all, so "make it wait longer" changed
// the delay for a mode the user wasn't in and nothing visible happened. Both
// modes read these now.

/**
 * Dwell required before the pill or the notch opens.
 *
 * The point is that a pointer travelling somewhere else shouldn't drag the
 * whole widget open on its way past — and in Free mode, that dragging the pill
 * (which necessarily hovers it for the length of the gesture) can't trip the
 * expand mid-drag. A deliberate click still opens instantly, so the delay
 * costs nothing to anyone who actually meant it.
 */
export const HOVER_EXPAND_DELAY_MS = 1500;

/**
 * Grace period before collapsing.
 *
 * Deliberately short — the widget is meant to stay open only while the pointer
 * is on it — but not zero: the reveal band and the panel don't share an exact
 * edge, and a few frames of slack stop a cursor crossing that seam from
 * flickering the menu shut and open again.
 */
export const HOVER_CLOSE_DELAY_MS = 110;
