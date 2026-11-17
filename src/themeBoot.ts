// Loaded as a classic script in <head> so the saved theme is on <html>
// before the page paints.
import { applyTheme, readTheme } from "./theme";

applyTheme(readTheme());
