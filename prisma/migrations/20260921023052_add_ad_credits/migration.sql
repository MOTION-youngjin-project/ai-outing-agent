-- CreateTable
CREATE TABLE `ad_credits` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `credits` INTEGER NOT NULL DEFAULT 0,
    `last_free_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `ad_credits_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ad_credits` ADD CONSTRAINT `ad_credits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

