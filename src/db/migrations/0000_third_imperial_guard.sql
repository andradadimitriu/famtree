CREATE TABLE `marriages` (
	`id` text PRIMARY KEY NOT NULL,
	`spouse1_id` text NOT NULL,
	`spouse2_id` text,
	FOREIGN KEY (`spouse1_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spouse2_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parentage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`marriage_id` text NOT NULL,
	`child_id` text NOT NULL,
	FOREIGN KEY (`marriage_id`) REFERENCES `marriages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`born` integer
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` text,
	`marriage_id` text,
	`file_path` text NOT NULL,
	`caption` text,
	`taken_year` integer,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marriage_id`) REFERENCES `marriages`(`id`) ON UPDATE no action ON DELETE no action
);
