import { Platform } from 'react-native';

export const LAYOUT = {
  /**
   * The vertical offset for KeyboardAvoidingView when a header is visible.
   * Adjust this value globally to change keyboard shifting height for form pages.
   */
  keyboardVerticalOffset: 120,
  /**
   * The one width limit for a page (2026-10-11): every page of cards or lists stops here, centred,
   * so a laptop or 1080p screen is filled and only a very wide monitor gets margins. Take it through
   * `<PageBody>`, never a number of the page's own — the pages had grown 720, 960 and 1060 between
   * them. A wide page uses the room by adding columns, not by stretching them.
   */
  pageMaxWidth: 1440,
  /**
   * A page that is one column of fields or rows — a settings page — keeps a reading width, since a
   * single row stretched across 1440px puts its label and its value a screen apart.
   */
  formMaxWidth: 720,
  /**
   * The content width (not the window's) at which a page of cards takes a third column. Measured,
   * because the sidebar takes its share of the window.
   */
  threeColumnsMinWidth: 1200,
  /**
   * The content width at which Home puts its two cards side by side; under it they stack. The
   * narrower column then still has room for an organisation's card on one line. Measured, as above.
   */
  twoColumnsMinWidth: 900,
  /**
   * The window width from which the sidebar may stay open. Under it the sidebar is always the icon
   * rail, opening on hover, whatever the person chose: at 256px it takes too much of the page. Their
   * choice is kept for when the window is wide again.
   */
  sidebarOpenMinWidth: 1280,
};
