/// <reference types="vite/client" />
import { localMusicSource } from "./local-music.js";
const assets = import.meta.glob<string>("./public/music/*.mp3", {
  query: "?inline",
  import: "default",
  eager: true,
});
const recordings = Object.fromEntries(
  Object.entries(assets).map(([path, data]) => [path.split("/").at(-1)!, data]),
);
export const packagedMusicSource = localMusicSource(recordings);
