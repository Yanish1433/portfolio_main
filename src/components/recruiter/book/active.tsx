"use client";

import { createContext, useContext } from "react";

/** True while this page is the open, settled page of the book (not mid-turn, not hidden). Animations key off it. */
export const PageActive = createContext(false);
export const usePageActive = () => useContext(PageActive);

/** Fired on window while a taped project video plays, so the dim pagoda behind the book can pause (one video at a time). */
export const BOOK_VIDEO_EVENT = "book-video";
