/// <reference types="vite/client" />
import { localRecordingFetch } from "./local-recordings.js";

const assets = import.meta.glob<string>("./public/sfx/*.wav", {
  query: "?inline",
  import: "default",
  eager: true,
});
const recordings = Object.fromEntries(
  Object.entries(assets).map(([path, data]) => [path.split("/").at(-1)!, data]),
);
export const packagedEffectsFetch = localRecordingFetch(recordings);
