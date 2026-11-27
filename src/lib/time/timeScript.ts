import { KEYS } from "@/components/world/nepal/timeLook";

/**
 * Inline, runs before first paint as a child of the page wrapper. Sets on that wrapper:
 *   data-theme = "day" | "night"   (night 18:45-06:15, same as themeAt)
 *   --glow     = night amount 0..1 (the keyframe table of timeLook.ts, embedded here, eased the same way)
 *   data-cover = "seen" when this session already opened the book cover (or the URL names a page), else "new"
 * Time rules are the same as clock.ts resolveMinutes (and store/world initialMinutes):
 *   ?time=HH:MM -> ?theme=day|night (12:00/22:00) -> localStorage "world-time" (or legacy "world-theme") -> local time.
 * No imports at run time; this is a string used by Server Components. timeScript.test.ts keeps it equal to clock.ts.
 */
const TABLE = JSON.stringify(KEYS.map((k) => [k.at, k.t]));

export const TIME_SCRIPT = `(function(){try{var d=document.currentScript.parentElement;var q=new URLSearchParams(location.search);var m=null;var tp=/^(\\d{1,2}):(\\d{2})$/.exec((q.get("time")||"").trim());if(tp&&+tp[1]<24&&+tp[2]<60)m=+tp[1]*60+ +tp[2];var t=q.get("theme");if(m===null&&t==="day")m=720;if(m===null&&t==="night")m=1320;var cv="new";try{if(sessionStorage.getItem("book-cover")==="1")cv="seen"}catch(e){}if(location.hash.length>1)cv="seen";if(m===null){try{var s=localStorage.getItem("world-time");if(s&&s!=="now"&&isFinite(+s))m=((Math.round(+s)%1440)+1440)%1440;else if(!s){var o=localStorage.getItem("world-theme");if(o==="day")m=720;if(o==="night")m=1320}}catch(e){}}if(m===null){var n=new Date();m=n.getHours()*60+n.getMinutes()}var K=${TABLE};var i=0;while(i<K.length-2&&m>=K[i+1][0])i++;var r=(m-K[i][0])/(K[i+1][0]-K[i][0]);var k=r*r*(3-2*r);var g=K[i][1]+(K[i+1][1]-K[i][1])*k;d.dataset.theme=m>=1125||m<375?"night":"day";d.dataset.cover=cv;d.style.setProperty("--glow",g.toFixed(3))}catch(e){}})();`;
