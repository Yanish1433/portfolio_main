import { create } from "zustand";
import { createCache, fetchNotes, getConfig, type Note } from "@/lib/guestbook";

/** True when the build has the Supabase env vars; without them the button hides and the flags stay empty. */
export const guestbookEnabled = () => getConfig() !== null;

type State = {
  notes: Note[];
  /** Note shown in the small card after tapping a flag. */
  card: Note | null;
  formOpen: boolean;
  setCard: (n: Note | null) => void;
  openForm: () => void;
  closeForm: () => void;
};

export const useGuestbook = create<State>((set) => ({
  notes: [],
  card: null,
  formOpen: false,
  setCard: (card) => set({ card }),
  openForm: () => set({ formOpen: true, card: null }),
  closeForm: () => set({ formOpen: false }),
}));

const cached = createCache(() => fetchNotes());

/** Load approved notes (5-minute cache; `force` after the visitor posts). Never throws. */
export async function loadNotes(force = false) {
  if (!guestbookEnabled()) return;
  const notes = await cached(force);
  useGuestbook.setState({ notes });
}
