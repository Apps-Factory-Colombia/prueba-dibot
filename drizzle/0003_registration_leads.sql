CREATE TABLE `registration_leads` (
	`email_hash` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
