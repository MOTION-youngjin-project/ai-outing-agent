-- CreateTable
CREATE TABLE `admin_action_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `admin_email` VARCHAR(255) NOT NULL,
    `action` ENUM('grant_ad_credit', 'reset_daily_free', 'delete_account') NOT NULL,
    `target_user_id` BIGINT UNSIGNED NULL,
    `target_email` VARCHAR(255) NOT NULL,
    `detail` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `admin_action_logs_target_user_id_created_at_idx`(`target_user_id`, `created_at`),
    INDEX `admin_action_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
