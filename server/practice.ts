import { Room, RoomOptions } from "./room.js";
import { Input, World } from "../shared/game.js";

// The same authority as internet matches, hosted on this device for solo play.
export class PracticeSession {
  readonly room: Room;
  readonly playerId = "practice-player";
  constructor(
    options: RoomOptions,
    name: string,
    classId: number,
    send: (message: unknown) => void,
    world?: World,
  ) {
    this.room = new Room("on-device", { ...options, practice: true }, world);
    this.room.add(
      this.playerId,
      name,
      { send: (data) => send(JSON.parse(data)) },
      false,
      classId,
    );
  }
  input(commands: Input[], epoch: number) {
    this.room.queueInputs(this.playerId, commands, epoch);
  }
  tick() {
    this.room.tick();
  }
}
