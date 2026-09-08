// How long a hover has to last before the widget opens, and how long it has to
// end before the widget closes.
//
// ONE HOME, because there were two. Free mode's delay lived in WidgetDock and
// Notch mode's reveal band had none at all, so "make it wait longer" changed
// the delay for a mode the user wasn't in and nothing visible happened. The
// dwell is now a setting both modes read; what lives here is its range and the
// close delay, which is not worth exposing.

/**
 * Bounds for the dwell setting (AppSettings.hoverExpandDelayMs).
 *
 * The floor is 0.7s because anything quicker stops being a dwell: a pointer
 * travelling to something else drags the widget open on its way past, which is
 * what the delay exists to prevent. The ceiling is 2s because beyond that the
 * wait stops reading as deliberate and starts reading as broken — there is no
 * progress shown while it counts down, so the only feedback is the widget
 * eventually appearing.
 *
 * In Free mode the delay does a second job: dragging the pill necessarily
 * hovers it for the whole gesture, and the timer is what stops that expanding
 * the widget out from under the cursor mid-drag. A deliberate click opens
 * instantly regardless, so none of this costs anyone who meant it.
 */
export const HOVER_DELAY_MIN_MS = 700;
export const HOVER_DELAY_MAX_MS = 2000;

/**
 * Grace period before collapsing.
 *
 * Deliberately short — the widget is meant to stay open only while the pointer
 * is on it — but not zero: the reveal band and the panel don't share an exact
 * edge, and a few frames of slack stop a cursor crossing that seam from
 * flickering the menu shut and open again.
 */
export const HOVER_CLOSE_DELAY_MS = 110;
