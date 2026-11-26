# Showcase media: where your pictures and videos go

Everything in this folder is served by the site from `/showcase/...`. The text for each project
(pitch, numbers, architecture) lives in **`src/content/profile.ts`**. There is a plain-English guide
at the top of that file. This folder only holds the files.

## Folder layout

```
public/showcase/
  README.md                  this file
  <project-id>/              one folder per project; <project-id> is the project's `id` in profile.ts
    poster.webp              the hero image (aim for under ~150 KB)
    shot-1.webp              screenshots, numbered: shot-1, shot-2, shot-3 ...
    shot-2.webp
    demo.mp4                 a short, silent screen recording (aim for under ~1.5 MB, 10-20 seconds);
                             demo.webm works too
  about/
    photo.webp               your photo
```

Example for the project with `id: "bookeasy"`:

```
public/showcase/bookeasy/poster.webp
public/showcase/bookeasy/shot-1.webp
public/showcase/bookeasy/demo.mp4
```

## Telling the site about the files

Add a `media` block to the project in `src/content/profile.ts`. Only list files that exist:

```ts
media: {
  poster: "/showcase/bookeasy/poster.webp",
  screenshots: ["/showcase/bookeasy/shot-1.webp", "/showcase/bookeasy/shot-2.webp"],
  video: "/showcase/bookeasy/demo.mp4",
},
```

## What the site shows when a file is missing

For a project's poster the site picks the first of these that exists:

1. `media.poster` from profile.ts
2. `public/showcase/<project-id>/poster.webp`
3. `public/projects/<project-id>.webp` (the older thumbnail folder)
4. a generated poster (project name on a coloured card)

No video means a still poster. A missing screenshot list just hides the gallery.

## How the videos are used

- **Living screens:** in the Project Hall, the stand you are standing nearest (within about 6 m, and on
  screen) plays its `video` on its screen: muted, looping, one stand at a time. Every other stand shows
  its poster. Phones and `?perf=low` always show posters.
- **Cinema mode:** "Open case study" shows the video first, then the screenshots, as a carousel.

## Placeholder media (for testing only)

`demo-a/` and `demo-b/` hold small generated clips (a fake booking app and a fake whiteboard). They are
**not** used by the real site. They only appear with `?debug&media=demo`, which gives the first two
projects these files. Your own files replace them: put them in your project's folder and list them
in profile.ts as shown above. You can delete `demo-a/` and `demo-b/` once real media is in.

## Tips

- Use `.webp` for images and `.mp4` (H.264) or `.webm` (VP9) for video. 16:9 or 16:10 images look best.
- Phones only get the poster, not the video.
- Don't put anything private (keys, real customer data) in screenshots.

## Fresh clone: running the checks

```bash
npx tsc --noEmit
npm run lint
node --no-warnings --import ./scripts/ts-resolve.mjs --test "src/**/*.test.ts"   # robot + showcase helpers
```

## Editing profile.ts

If you edit `src/content/profile.ts` on `main` while a feature branch is also changing it, git will
need to merge the two. Make big profile edits after the feature has been merged.
