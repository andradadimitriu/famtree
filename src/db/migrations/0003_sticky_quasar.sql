PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`born` text,
	`died` text,
	`bio` text
);
--> statement-breakpoint
INSERT INTO `__new_people`("id", "name", "born", "died", "bio") SELECT "id", "name", "born", "died", "bio" FROM `people`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
PRAGMA foreign_keys=ON;