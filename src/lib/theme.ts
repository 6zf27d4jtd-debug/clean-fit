export type ThemePreference = "sistema" | "chiaro" | "scuro";

export const THEME_STORAGE_KEY = "cleanfit-tema";

const THEME_COLORS = { light: "#fafaf8", dark: "#0e0e0f" };

/** Applica il tema a <html> e aggiorna il colore della barra di stato. */
export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "scuro" ||
    (preference === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  });
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "chiaro" || stored === "scuro") return stored;
  } catch {}
  return "sistema";
}

/** Script eseguito prima del rendering, per evitare il lampo del tema sbagliato. */
export const themeScript = `(function(){try{
var p=localStorage.getItem("${THEME_STORAGE_KEY}");
var m=window.matchMedia("(prefers-color-scheme: dark)");
function a(){var d=p==="scuro"||(p!=="chiaro"&&m.matches);document.documentElement.classList.toggle("dark",d);}
a();m.addEventListener("change",function(){p=localStorage.getItem("${THEME_STORAGE_KEY}");a();});
}catch(e){}})();`;
