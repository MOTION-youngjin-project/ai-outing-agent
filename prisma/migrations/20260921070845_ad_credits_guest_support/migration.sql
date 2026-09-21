-- AlterTable
ALTER TABLE `ad_credits` ADD COLUMN `session_key_hash` VARCHAR(64) NULL,
    MODIFY `user_id` BIGINT UNSIGNED NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ad_credits_session_key_hash_key` ON `ad_credits`(`session_key_hash`);

