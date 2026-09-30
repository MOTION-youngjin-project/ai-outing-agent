-- AlterTable
ALTER TABLE `place_images` ADD COLUMN `hidden_at` TIMESTAMP(0) NULL;

-- CreateTable
CREATE TABLE `place_image_reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `place_image_id` BIGINT UNSIGNED NOT NULL,
    `reporter_user_id` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `resolved_at` TIMESTAMP(0) NULL,

    INDEX `place_image_reports_place_image_id_idx`(`place_image_id`),
    INDEX `place_image_reports_resolved_at_idx`(`resolved_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `place_image_reports` ADD CONSTRAINT `place_image_reports_place_image_id_fkey` FOREIGN KEY (`place_image_id`) REFERENCES `place_images`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
