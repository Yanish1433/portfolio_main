/**
 * Runs inline, before first paint, as the first child of the recruiter wrapper.
 * It sets data-theme ("light" | "dark") on that wrapper.
 *
 * KEEP IN SYNC with initialTheme() in "@/store/world":
 *   ?theme=day|night  ->  localStorage "world-theme"  ->  local hour (night 18:00-06:00).
 * day = light, night = dark (see theme.ts). No imports here: this file is used by a Server Component.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.currentScript.parentElement;var t=new URLSearchParams(location.search).get("theme");if(t!=="day"&&t!=="night"){try{t=localStorage.getItem("world-theme")}catch(e){t=null}}if(t!=="day"&&t!=="night"){var h=new Date().getHours();t=h>=18||h<6?"night":"day"}d.dataset.theme=t==="night"?"dark":"light"}catch(e){}})();`;
