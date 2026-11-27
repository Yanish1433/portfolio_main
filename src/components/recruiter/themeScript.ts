/**
 * Runs inline, before first paint, as the first child of the recruiter wrapper.
 * It sets data-theme ("light" | "dark") on that wrapper.
 *
 * KEEP IN SYNC with initialTheme() in "@/store/world":
 *   ?time=HH:MM -> ?theme=day|night (12:00/22:00) -> localStorage "world-time" (or legacy "world-theme") -> local time (night 18:45-06:15).
 * day = light, night = dark (see theme.ts). No imports here: this file is used by a Server Component.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.currentScript.parentElement;var q=new URLSearchParams(location.search);var m=null;var tp=/^(\\d{1,2}):(\\d{2})$/.exec(q.get("time")||"");if(tp&&+tp[1]<24&&+tp[2]<60)m=+tp[1]*60+ +tp[2];var t=q.get("theme");if(m===null&&t==="day")m=720;if(m===null&&t==="night")m=1320;if(m===null){try{var s=localStorage.getItem("world-time");if(s&&s!=="now"&&isFinite(+s))m=+s%1440;else if(!s){var o=localStorage.getItem("world-theme");if(o==="day")m=720;if(o==="night")m=1320}}catch(e){}}if(m===null){var n=new Date();m=n.getHours()*60+n.getMinutes()}d.dataset.theme=m>=1125||m<375?"dark":"light"}catch(e){}})();`;
