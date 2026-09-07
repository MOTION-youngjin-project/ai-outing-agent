-- AlterTable
ALTER TABLE `agent_runs` ADD COLUMN `user_id` BIGINT UNSIGNED NULL,
    ADD COLUMN `user_query` VARCHAR(1000) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `preferred_tags` JSON NULL;

-- CreateIndex
CREATE INDEX `agent_runs_user_id_started_at_idx` ON `agent_runs`(`user_id`, `started_at`);

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
