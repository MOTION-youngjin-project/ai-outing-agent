"use client";

import { create } from "zustand";
import { photoPreferencesSchema, type PhotoPreferences } from "./photo-preferences";

// Only user-confirmed text survives client-side navigation. Never keep a File/blob or model draft here.
export const usePhotoPreferences = create<{
  confirmed: PhotoPreferences | null;
  confirm: (input: PhotoPreferences) => void;
  clear: () => void;
}>((set) => ({
  confirmed: null,
  confirm: (input) => set({ confirmed: photoPreferencesSchema.parse(input) }),
  clear: () => set({ confirmed: null }),
}));
