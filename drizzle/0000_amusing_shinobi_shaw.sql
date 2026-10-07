CREATE TABLE `app_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`app_name` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_a_id` text NOT NULL,
	`user_b_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_pair_unique` ON `matches` (`user_a_id`,`user_b_id`);--> statement-breakpoint
CREATE INDEX `matches_user_a_idx` ON `matches` (`user_a_id`);--> statement-breakpoint
CREATE INDEX `matches_user_b_idx` ON `matches` (`user_b_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_match_idx` ON `messages` (`match_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`week_key` text NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_logs_dedupe_unique` ON `notification_logs` (`user_id`,`kind`,`week_key`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`provider` text NOT NULL,
	`external_id` text,
	`type` text NOT NULL,
	`amount_mxn` integer,
	`status` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_external_unique` ON `payment_events` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `payment_events_user_idx` ON `payment_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`plan` text NOT NULL,
	`price_mxn` integer NOT NULL,
	`status` text NOT NULL,
	`next_billing_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_provider_idx` ON `subscriptions` (`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sender_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_messages_user_idx` ON `support_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `swipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swipes_user_target_unique` ON `swipes` (`user_id`,`target_user_id`);--> statement-breakpoint
CREATE INDEX `swipes_user_idx` ON `swipes` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_key` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_photos_user_position_unique` ON `user_photos` (`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `user_photos_user_idx` ON `user_photos` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`city` text NOT NULL,
	`bio` text NOT NULL,
	`occupation` text,
	`salary` text,
	`economic_activity` text,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`plan` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);