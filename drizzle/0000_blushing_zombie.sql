CREATE TABLE `game_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`updated` integer NOT NULL
);
