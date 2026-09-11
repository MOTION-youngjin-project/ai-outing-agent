-- 저장한 코스. recommendation_routes를 FK로 가리키지 않고 코스 내용을 JSON으로 스냅샷한다
-- (agent_runs TTL 24시간 + 만료분 하드 삭제 예정이라 포인터로 두면 저장본이 사라짐).
-- agent_run_id도 FK 없이 값만 둔다 — 같은 코스 중복 저장을 막는 용도.
-- CreateTable
CREATE TABLE `saved_courses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `agent_run_id` CHAR(36) NULL,
    `title` VARCHAR(250) NOT NULL,
    `snapshot` JSON NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `saved_courses_public_id_key`(`public_id`),
    UNIQUE INDEX `saved_courses_user_id_agent_run_id_key`(`user_id`, `agent_run_id`),
    INDEX `saved_courses_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saved_courses` ADD CONSTRAINT `saved_courses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
