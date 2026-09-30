-- CreateTable
CREATE TABLE `recommendation_usages` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `session_key_hash` VARCHAR(64) NULL,
    `agent_run_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `recommendation_usages_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `recommendation_usages_session_key_hash_created_at_idx`(`session_key_hash`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `plan_code` VARCHAR(40) NOT NULL,
    `status` ENUM('incomplete', 'active', 'past_due', 'canceled') NOT NULL DEFAULT 'incomplete',
    `customer_key` CHAR(36) NOT NULL,
    `billing_key` VARCHAR(200) NULL,
    `current_period_start` TIMESTAMP(0) NULL,
    `current_period_end` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `subscriptions_user_id_key`(`user_id`),
    UNIQUE INDEX `subscriptions_customer_key_key`(`customer_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
    `payment_key` VARCHAR(200) NULL,
    `requested_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `approved_at` TIMESTAMP(0) NULL,
    `failure_message` VARCHAR(500) NULL,

    UNIQUE INDEX `payments_order_id_key`(`order_id`),
    INDEX `payments_user_id_requested_at_idx`(`user_id`, `requested_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recommendation_usages` ADD CONSTRAINT `recommendation_usages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
